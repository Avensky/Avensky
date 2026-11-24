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

export function stagingRelease(prebuiltFile) {
  const release = baseStagingRelease(prebuiltFile);
  const fitted = JSON.parse(readFileSync(new URL("./staging-fitted-assets.json", import.meta.url), "utf8"));
  for (const [path, entry] of Object.entries(fitted)) {
    const existing = release.assets[path];
    if (existing && (existing.sha256 !== entry.sha256 || existing.size !== entry.size)) {
      throw new Error("Fitted staging metadata disagrees with the release for " + path);
    }
  }
  return validateRelease(sealRelease({ ...release, assets: { ...release.assets, ...fitted } }));
}

export function localGlbEntry(path) {
  const file = localAsset(path);
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error("Missing prebuilt asset " + path);
  const bytes = readFileSync(file);
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF"
    || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error("Expected GLB bytes for " + path);
  return { sha256: digest(bytes), size: bytes.length };
}
