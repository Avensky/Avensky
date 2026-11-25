import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAssetPath } from "../src/assets/assetPaths.ts";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const publicRoot = new URL("../public/", import.meta.url);
export const releaseOutput = new URL("../.asset-release/staging.json", import.meta.url);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const sha256 = /^[a-f0-9]{64}$/;

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

export function localAsset(path) {
  return new URL(path.slice(1).split("/").map(encodeURIComponent).join("/"), publicRoot);
}

export function trackedAssets() {
  const tracked = git(["ls-files", "-z", "--", "frontend/public/models", "frontend/public/textures"])
    .split("\0").map(file => file.slice("frontend/public".length)).filter(isAssetPath);
  const lfs = new Map(JSON.parse(git(["lfs", "ls-files", "--json"])).files.map(file => [
    file.name, { sha256: file.oid, size: file.size },
  ]));
  return Object.fromEntries(tracked.sort().map(path => {
    const pointer = lfs.get("frontend/public" + path);
    if (pointer) return [path, pointer];
    if (path.endsWith(".glb")) throw new Error("Expected a Git LFS entry for " + path);
    const bytes = readFileSync(localAsset(path));
    return [path, { sha256: digest(bytes), size: bytes.length }];
  }));
}

export function sealRelease({ assets, previews = {}, wardrobeRevisions = [] }) {
  const contents = {
    version: 1,
    environment: "staging",
    assets: Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
    previews: Object.fromEntries(Object.entries(previews).sort()),
    wardrobeRevisions: [...wardrobeRevisions].sort(),
  };
  return { ...contents, id: digest(JSON.stringify(contents)) };
}

export function validateRelease(release) {
  if (release?.version !== 1 || release.environment !== "staging"
    || !release.assets || typeof release.assets !== "object" || Array.isArray(release.assets)
    || !release.previews || typeof release.previews !== "object" || Array.isArray(release.previews)
    || !Array.isArray(release.wardrobeRevisions) || !release.wardrobeRevisions.every(id => typeof id === "string")) {
    throw new Error("Invalid staging asset release");
  }
  for (const [path, entry] of Object.entries(release.assets)) {
    if (!isAssetPath(path) || !sha256.test(entry?.sha256) || !Number.isSafeInteger(entry.size) || entry.size <= 0) {
      throw new Error("Invalid staging manifest entry for " + path);
    }
  }
  for (const [model, url] of Object.entries(release.previews)) {
    if (!/^[a-z0-9-]+$/.test(model) || typeof url !== "string"
      || !url.startsWith("/models/heroes-generated/") || !release.assets[url]?.sha256) {
      throw new Error("Invalid staging vehicle preview for " + model);
    }
  }
  const sealed = sealRelease(release);
  if (sealed.id !== release.id) throw new Error("Staging asset release digest does not match its contents");
  return sealed;
}

export function readRelease(file) {
  return validateRelease(JSON.parse(readFileSync(file, "utf8")));
}

const metadataInputs = [
  "frontend/scripts/build-heroes-vehicle-previews.mjs",
  "frontend/scripts/build-harbor-facades.mjs",
  "frontend/scripts/build-character-lods.mjs",
  "frontend/scripts/build-wardrobe-pieces.mjs",
  "frontend/scripts/pack-portrait-geometry.mjs",
  "frontend/scripts/character-model-paths.mts",
  "frontend/src/game/characters/underbustFit.ts",
  "frontend/src/game/characters/wardrobeSurface.ts",
  "frontend/src/world/facades/wallGeometry.ts",
  "frontend/src/world/facades/wallPanels.json",
  "avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json",
  "frontend/scripts/discover-wardrobe-garments.mts",
  "packages/wardrobe-catalog/character-wardrobe.json",
  "packages/wardrobe-catalog/character-garments.json",
  "packages/wardrobe-catalog/discovered-wardrobe-garments.json",
  "frontend/package-lock.json",
];

export function textDigest(path) {
  return digest(readFileSync(new URL(path, new URL("../../", import.meta.url)), "utf8").replaceAll("\r\n", "\n"));
}

export function metadataRevision(assets) {
  return digest(JSON.stringify([sealRelease({ assets }).id, metadataInputs.map(textDigest)]));
}

function baseStagingRelease(prebuiltFile) {
  const assets = trackedAssets();
  if (!prebuiltFile) return sealRelease({ assets });
  const prebuilt = JSON.parse(readFileSync(prebuiltFile, "utf8"));
  if (prebuilt.source !== metadataRevision(assets)) {
    throw new Error("Prebuilt asset metadata is stale. Regenerate it with npm --prefix frontend run assets:prepare");
  }
  const release = validateRelease(prebuilt.release);
  for (const [path, entry] of Object.entries(assets)) {
    if (release.assets[path]?.sha256 !== entry.sha256 || release.assets[path]?.size !== entry.size) {
      throw new Error("Prebuilt metadata disagrees with Git LFS for " + path);
    }
  }
  return release;
}

/**
 * A checked-in registry determines every approved private asset in staging.
 * Adding a new pack means adding its metadata catalog, never an Actions variable.
 * Catalogs store paths, hashes and lengths only; the GLB bytes stay in private S3.
 */
export function collectApprovedPrivateAssets(catalogs) {
  if (!Array.isArray(catalogs) || !catalogs.length) throw new Error("Expected approved private asset catalogs");
  const assets = {};
  for (const catalog of catalogs) {
    if (catalog === null || typeof catalog !== "object") throw new Error("Invalid private asset catalog");
    const entries = Array.isArray(catalog)
      ? catalog.map(item => [item?.url, item])
      : Object.entries(catalog);
    for (const [path, entry] of entries) {
      if (!isAssetPath(path) || !sha256.test(entry?.sha256)
        || !Number.isSafeInteger(entry.size) || entry.size <= 0) {
        throw new Error("Invalid private asset metadata for " + String(path));
      }
      const existing = assets[path];
      if (existing && (existing.sha256 !== entry.sha256 || existing.size !== entry.size)) {
        throw new Error("Conflicting approved private asset metadata for " + path);
      }
      assets[path] = { sha256: entry.sha256, size: entry.size };
    }
  }
  return assets;
}

function approvedPrivateAssets() {
  const files = JSON.parse(readFileSync(new URL("./staging-private-asset-catalogs.json", import.meta.url), "utf8"));
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length) {
    throw new Error("Invalid private asset catalog registry");
  }
  const catalogs = files.map(path => {
    if (typeof path !== "string"
      || !/^(?:frontend\/scripts|packages\/wardrobe-catalog)\/[a-z0-9_./-]+\.json$/.test(path)
      || path.split("/").some(part => part === "." || part === "..")) {
      throw new Error("Unsafe private asset catalog path: " + String(path));
    }
    return JSON.parse(readFileSync(new URL("../../" + path, import.meta.url), "utf8"));
  });
  return collectApprovedPrivateAssets(catalogs);
}

export function stagingRelease(prebuiltFile) {
  const release = baseStagingRelease(prebuiltFile);
  const approved = approvedPrivateAssets();
  for (const [path, entry] of Object.entries(approved)) {
    const existing = release.assets[path];
    if (existing && (existing.sha256 !== entry.sha256 || existing.size !== entry.size)) {
      throw new Error("Approved private asset conflicts with tracked release for " + path);
    }
  }
  return validateRelease(sealRelease({ ...release, assets: { ...release.assets, ...approved } }));
}

export function localGlbEntry(path) {
  const file = localAsset(path);
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error("Missing prebuilt asset " + path);
  const bytes = readFileSync(file);
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF"
    || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error("Expected GLB bytes for " + path);
  return { sha256: digest(bytes), size: bytes.length };
}
