import { createServer } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ASSET_ROUTE, isAssetPath } from "../../frontend/src/assets/assetPaths.ts";
import { readVerifiedRelease } from "./verify-release.mjs";
import { readRelease } from "../../frontend/scripts/staging-release.mjs";
import { signedObjectReader, storageKey, storageLayouts } from "./object-store.mjs";

const contentTypes = {
  glb: "model/gltf-binary",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  ktx2: "image/ktx2",
  bin: "application/octet-stream",
};

function errorResponse(response, status, message) {
  response.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
  response.end(message + "\n");
}

// Private staging trusts the metadata inside deployed frontend bundles, not
// a separate manually verified S3 release. Catalog paths remain allowlisted.
function installedRelease(root, id) {
  if (!root || !/^[a-f0-9]{64}$/.test(id)) return null;
  let dirs;
  try { dirs = readdirSync(join(root, "releases"), { withFileTypes: true }); }
  catch { return null; }
  for (const item of dirs) {
    if (!item.isDirectory() || !/^[a-f0-9]{40}$/.test(item.name)) continue;
    try {
      const folder = join(root, "releases", item.name);
      const bundle = JSON.parse(readFileSync(join(folder, "bundle.json"), "utf8"));
      if (bundle.environment !== "staging" || bundle.commit !== item.name || bundle.assetRelease !== id) continue;
      const release = readRelease(join(folder, "asset-release.json"));
      if (release.id === id) return release;
    } catch { /* An incomplete or unrelated release is not advertised. */ }
  }
  return null;
}

function requestedAsset(url, releases, runtimeRoot) {
  const match = /^\/([a-f0-9]{64})(\/[^?#]+)$/.exec(url.slice(ASSET_ROUTE.length));
  if (!url.startsWith(ASSET_ROUTE + "/") || !match) return;
  try {
    const path = decodeURIComponent(match[2]);
    let release = releases.get(match[1]);
    if (!release) {
      release = installedRelease(runtimeRoot, match[1]);
      if (release) releases.set(release.id, release);
    }
    if (isAssetPath(path) && release && Object.hasOwn(release.assets, path)) {
      const entry = release.assets[path];
      const verified = release.objects?.[path];
      const layouts = verified ? [verified.layout] : storageLayouts(path);
      return {
        path, size: entry.size, etag: verified?.etag,
        keys: layouts.map(layout => storageKey(path, entry.sha256, layout)),
      };
    }
  } catch { /* Malformed URL or incomplete release. */ }
}

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return start <= end ? { start, end } : null;
}

export function assetGateway(releases, readObject = signedObjectReader(), options = {}) {
  const available = new Map(releases.map(release => [release.id, release]));
  const runtimeRoot = options.runtimeRoot ?? process.env.AVENSKY_STAGING_FRONTEND_ROOT;
  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return errorResponse(response, 405, "Method not allowed");
    }
    const asset = requestedAsset(request.url ?? "", available, runtimeRoot);
    if (!asset) return errorResponse(response, 404, "Staging asset is missing from this release");

    // The route has no response validator for If-Range. Serve the whole object in that case.
    const rangeHeader = request.method === "GET" && !request.headers["if-range"] ? request.headers.range : undefined;
    const range = rangeHeader && byteRange(rangeHeader, asset.size);
    if (rangeHeader !== undefined && !range) {
      response.setHeader("Content-Range", "bytes */" + asset.size);
      return errorResponse(response, 416, "Expected a satisfiable single byte range");
    }
    const abort = new AbortController();
    response.on("close", () => abort.abort());
    try {
      let upstream;
      for (const [index, key] of asset.keys.entries()) {
        upstream = await readObject(key, {
          signal: abort.signal,
          range: range ? `bytes=${range.start}-${range.end}` : undefined,
          etag: asset.etag,
        });
        if (index < asset.keys.length - 1 && [403, 404].includes(upstream.status)) {
          await upstream.body?.cancel();
          continue;
        }
        break;
      }
      if (upstream.status === 404) {
        await upstream.body?.cancel();
        return errorResponse(response, 404, "Staging object is missing from private storage");
      }
      if (upstream.status === 416 && range) {
        await upstream.body?.cancel();
        response.setHeader("Content-Range", "bytes */" + asset.size);
        return errorResponse(response, 416, "Range outside staging object");
      }
      const length = Number(upstream.headers.get("content-length"));
      const contentRange = upstream.headers.get("content-range");
      const validRange = range
        && contentRange === `bytes ${range.start}-${range.end}/${asset.size}`
        && length === range.end - range.start + 1;
      if (upstream.headers.has("content-encoding") || !upstream.body || (asset.etag && upstream.headers.get("etag") !== asset.etag)
        || (range ? upstream.status !== 206 || !validRange
          : upstream.status !== 200 || length !== asset.size || contentRange !== null)) {
        await upstream.body?.cancel();
        return errorResponse(response, 502, "Staging object is unavailable or its size disagrees with the release");
      }
      const headers = {
        "Content-Type": contentTypes[asset.path.split(".").at(-1).toLowerCase()],
        "Content-Length": length,
        "Cache-Control": "private, max-age=86400, immutable",
        "Accept-Ranges": "bytes",
        "X-Content-Type-Options": "nosniff",
      };
      if (contentRange) headers["Content-Range"] = contentRange;
      response.writeHead(upstream.status, headers);
      if (request.method === "HEAD") {
        await upstream.body.cancel();
        response.end();
      } else {
        await pipeline(upstream.body, response, { signal: abort.signal });
      }
    } catch {
      if (!response.destroyed && !response.headersSent) errorResponse(response, 502, "Staging asset delivery failed");
      else response.destroy();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifests = process.argv.slice(2);
  if (!manifests.length && !process.env.AVENSKY_STAGING_FRONTEND_ROOT) throw new Error("Specify a previous release or a staging frontend root");
  const port = Number(process.env.AVENSKY_ASSET_PORT ?? "9060");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid gateway port");
  assetGateway(manifests.map(readVerifiedRelease)).listen(port, "127.0.0.1", () => {
    console.log("Private staging asset gateway listening on loopback port " + port);
  });
}
