import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { prepareBuild } from "./prepare-build.mjs";
import { localGlbEntry, localAsset, metadataRevision, publicRoot, sealRelease, trackedAssets } from "./staging-release.mjs";
import { bundledVesperPortrait, hasCompatibleWardrobeRevision } from "./character-model-paths.mts";
import { wardrobeCatalogFile, discoveredWardrobeCatalogFile } from "./discover-wardrobe-garments.mts";
import { isAssetPath } from "../src/assets/assetPaths.ts";

prepareBuild();
const assets = trackedAssets();
const source = metadataRevision(assets);
const previews = Object.fromEntries(Object.entries(
  JSON.parse(readFileSync(new URL("models/heroes-generated/previews.json", publicRoot), "utf8")),
).map(([model, url]) => [model, url.split("?")[0]]));
const corsetRoot = "/models/characters/female/wardrobe/";
const corsets = readdirSync(new URL("models/characters/female/wardrobe/corsets/", publicRoot))
  .filter(name => /^gothic-\d{2}\.(garage|mobile)\.glb$/.test(name))
  .map(name => corsetRoot + "corsets/" + name);
const optional = [
  "/models/harbor-generated/dock-facades.glb",
  corsetRoot + "vesper-body.glb",
  bundledVesperPortrait()?.url,
  ...corsets,
];
for (const path of Object.values(previews)) assets[path] = localGlbEntry(path);
for (const path of optional) {
  if (path && existsSync(localAsset(path))) assets[path] = localGlbEntry(path);
}

const wardrobeRevisions = [wardrobeCatalogFile, discoveredWardrobeCatalogFile]
  .flatMap(file => JSON.parse(readFileSync(file, "utf8")))
  .filter(({ retired, revisionUrl, url }) => !retired && revisionUrl && isAssetPath(revisionUrl)
    && Object.hasOwn(assets, revisionUrl) && Object.hasOwn(assets, url)
    && hasCompatibleWardrobeRevision(localAsset(revisionUrl), localAsset(url)))
  .map(({ id }) => id);

const output = new URL("../.asset-release/prebuilt.json", import.meta.url);
mkdirSync(new URL(".", output), { recursive: true });
writeFileSync(output, JSON.stringify({ source, release: sealRelease({ assets, previews, wardrobeRevisions }) }, null, 2) + "\n");
console.log("Wrote frontend/.asset-release/prebuilt.json");
