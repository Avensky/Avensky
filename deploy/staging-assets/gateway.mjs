import { createServer } from "node:http";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ASSET_ROUTE, isAssetPath } from "../../frontend/src/assets/assetPaths.ts";
import { readVerifiedRelease } from "./verify-release.mjs";
import { signedObjectReader, storageKey } from "./object-store.mjs";

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

function requestedAsset(url, releases) {
  const match = /^\/([a-f0-9]{64})(\/[^?#]+)$/.exec(url.slice(ASSET_ROUTE.length));
  if (!url.startsWith(ASSET_ROUTE + "/") || !match) return;
  try {
    const path = decodeURIComponent(match[2]);
    const release = releases.get(match[1]);
    if (isAssetPath(path) && release && Object.hasOwn(release.assets, path)) {
      const entry = release.assets[path];
      const { etag, layout } = release.objects[path];
      return { path, size: entry.size, etag, key: storageKey(path, entry.sha256, layout) };
    }
  } catch {
    // Malformed percent encoding is an unknown asset.
  }
}

export function assetGateway(releases, readObject = signedObjectReader()) {
  const available = new Map(releases.map(release => [release.id, release]));
  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return errorResponse(response, 405, "Method not allowed");
    }
    const asset = requestedAsset(request.url ?? "", available);
    if (!asset) return errorResponse(response, 404, "Staging asset is missing from this release");

    const range = request.method === "GET" ? request.headers.range : undefined;
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) {
      response.setHeader("Content-Range", "bytes */" + asset.size);
      return errorResponse(response, 416, "Expected a single byte range");
    }
    const abort = new AbortController();
    response.on("close", () => abort.abort());
    try {
      const upstream = await readObject(asset.key, { signal: abort.signal, range, etag: asset.etag });
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
      const partial = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange ?? "");
      const validRange = partial && Number(partial[3]) === asset.size && Number(partial[2]) < asset.size
        && Number(partial[2]) - Number(partial[1]) + 1 === length && length > 0;
      if (upstream.headers.has("content-encoding") || !upstream.body || upstream.headers.get("etag") !== asset.etag
        || (range ? upstream.status !== 206 || !validRange : upstream.status !== 200 || length !== asset.size)) {
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
  if (!manifests.length) throw new Error("Pass at least one verified staging release file");
  const port = Number(process.env.AVENSKY_ASSET_PORT ?? "9060");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid gateway port");
  assetGateway(manifests.map(readVerifiedRelease)).listen(port, "127.0.0.1", () => {
    console.log("Private staging asset gateway listening on loopback port " + port);
  });
}
