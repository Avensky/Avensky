import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { kitAssets } from "../src/worldBuilder/mapKit/catalog.ts";
import { localAsset, textDigest, trackedAssets } from "./staging-release.mjs";

const lockFile = new URL("./prebuilt-colliders.json", import.meta.url);
const repo = new URL("../../", import.meta.url);
const roadCatalog = "avenlab-server/src/assets/roads/road-colliders.json";
const garageCatalog = "avenlab-server/src/assets/models/placement-colliders.json";
const textFiles = [
  roadCatalog,
  garageCatalog,
  "avenlab-server/src/assets/roads/map-kit-colliders.json",
  "frontend/src/worldBuilder/mapKit/outlines.json",
  "frontend/public/models/roads/catalog.json",
  "scripts/build-road-colliders.mjs",
  "scripts/build-placement-colliders.mjs",
  "scripts/build-map-kit-colliders.mjs",
  "frontend/src/worldBuilder/mapKit/catalog.ts",
  "frontend/src/worldBuilder/roadKit/roadKitCore.ts",
  "frontend/src/worldBuilder/roads/roadGeometry.ts",
];
const readJson = path => JSON.parse(readFileSync(new URL(path, repo), "utf8"));

function snapshot(requireBytes) {
  const tracked = trackedAssets();
  const catalogLods = [roadCatalog, garageCatalog].flatMap(file =>
    readJson(file).assets.flatMap(asset => asset.lods),
  );
  const expected = new Map(catalogLods.map(({ url, sha256 }) => [url.split("?")[0], sha256]));
  const files = [...new Set([
    ...expected.keys(),
    ...kitAssets.map(asset => "/models/roads/" + asset.collisionFile),
    ...kitAssets.filter(asset => asset.id.startsWith("highway_")).map(asset => "/models/roads/" + asset.lodFiles[0]),
  ])].sort();
  const sources = Object.fromEntries(files.map(path => {
    const entry = tracked[path];
    const file = localAsset(path);
    const size = statSync(file, { throwIfNoEntry: false })?.size;
    if (!entry || !size || (expected.has(path) && expected.get(path) !== entry.sha256)) {
      throw new Error("Collision catalog disagrees with the checked-in source for " + path);
    }
    const bytes = readFileSync(file);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const pointer = bytes.length < 256 && /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\nsize (\d+)\r?\n$/.exec(bytes.toString("utf8"));
    const matches = pointer
      ? !requireBytes && pointer[1] === entry.sha256 && Number(pointer[2]) === entry.size
      : bytes.length === entry.size && hash === entry.sha256;
    if (!matches) throw new Error("Invalid collision source " + path + (requireBytes ? ". Fetch its Git LFS object first." : ""));
    return [path, entry];
  }));
  return { version: 1, sources, files: Object.fromEntries(textFiles.map(path => [path, textDigest(path)])) };
}

export function checkPrebuiltColliders() {
  if (!isDeepStrictEqual(snapshot(false), JSON.parse(readFileSync(lockFile, "utf8")))) {
    throw new Error("Prebuilt collision inputs or outputs changed. Run npm --prefix frontend run assets:lock-colliders with the collision GLBs installed.");
  }
}

export function writePrebuiltColliders() {
  writeFileSync(lockFile, JSON.stringify(snapshot(true), null, 2) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) checkPrebuiltColliders();
