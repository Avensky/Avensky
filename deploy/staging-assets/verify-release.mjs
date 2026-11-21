import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAssetPath } from "../../frontend/src/assets/assetPaths.ts";
import { validateRelease } from "../../frontend/scripts/staging-release.mjs";

const objectTag = /^"[a-f0-9]{32}(?:-\d+)?"$/i;

export function readVerifiedRelease(file) {
  const { release, objects } = JSON.parse(readFileSync(file, "utf8"));
  const checked = validateRelease(release);
  for (const path of Object.keys(checked.assets)) {
    const object = objects?.[path];
    if (!objectTag.test(object?.etag ?? "") || !["digest", "flat"].includes(object.layout)) {
      throw new Error("Missing verified AWS object metadata for " + path);
    }
  }
  return { ...checked, objects };
}

export function checkDependencies(path, json, assets) {
  const prefix = "/__staging-assets/verify";
  const base = new URL(prefix + path.split("/").map(encodeURIComponent).join("/"), "https://assets.invalid");
  for (const { uri } of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (uri === undefined || (typeof uri === "string" && uri.startsWith("data:"))) continue;
    if (typeof uri !== "string" || !uri || /^(?:[a-z][\w+.-]*:|\/)|[\\?#]/i.test(uri)) {
      throw new Error("External GLB dependencies must use a relative asset path");
    }
    const target = new URL(uri, base);
    const logical = decodeURIComponent(target.pathname.slice(prefix.length));
    if (target.origin !== base.origin || !target.pathname.startsWith(prefix + "/")
      || !isAssetPath(logical) || !Object.hasOwn(assets, logical)) {
      throw new Error("GLB dependency is missing from the release: " + logical);
    }
  }
}

export async function verifyObject(response, path, entry, assets) {
  if (response.status !== 200 || !response.body || response.headers.has("content-encoding")) {
    await response.body?.cancel();
    throw new Error("Private object returned HTTP " + response.status);
  }
  const hash = createHash("sha256");
  let size = 0;
  // Retain the GLB JSON chunk only, so integrity checks never need a full model on disk.
  let prefix = path.toLowerCase().endsWith(".glb") ? Buffer.alloc(20) : undefined;
  let at = 0;
  for await (const chunk of response.body) {
    hash.update(chunk);
    size += chunk.length;
    if (size > entry.size) throw new Error("Object exceeds the declared size");
    if (!prefix) continue;
    let offset = 0;
    while (prefix && offset < chunk.length) {
      const count = Math.min(prefix.length - at, chunk.length - offset);
      prefix.set(chunk.subarray(offset, offset + count), at);
      at += count;
      offset += count;
      if (at !== prefix.length) continue;
      if (prefix.length === 20) {
        const length = prefix.readUInt32LE(12);
        if (prefix.toString("ascii", 0, 4) !== "glTF" || prefix.readUInt32LE(4) !== 2
          || prefix.readUInt32LE(8) !== entry.size || prefix.readUInt32LE(16) !== 0x4e4f534a
          || length < 4 || length > Math.min(entry.size - 20, 32 * 1024 * 1024)) {
          throw new Error("Invalid GLB header");
        }
        prefix = Buffer.alloc(length + 20);
        at = 20;
      } else {
        checkDependencies(path, JSON.parse(prefix.toString("utf8", 20)), assets);
        prefix = undefined;
      }
    }
  }
  if (prefix || size !== entry.size || hash.digest("hex") !== entry.sha256) {
    throw new Error("Object SHA-256 or byte count disagrees with the manifest");
  }
  const etag = response.headers.get("etag");
  if (!objectTag.test(etag ?? "")) throw new Error("Missing AWS object ETag");
  return etag;
}
