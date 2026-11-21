import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { root } from "./staging-release.mjs";

const syncScripts = [
  "scripts/sync-vehicle-asset-catalog.mjs",
  "scripts/sync-world-builder-map.mjs",
  "scripts/sync-road-kit-catalog.mjs",
];
const colliderScripts = [
  "scripts/build-road-colliders.mjs",
  "scripts/build-placement-colliders.mjs",
  "scripts/build-map-kit-colliders.mjs",
];
const generatedScripts = [
  "frontend/scripts/build-heroes-vehicle-previews.mjs",
  "frontend/scripts/build-harbor-facades.mjs",
  "frontend/scripts/build-character-lods.mjs",
  "frontend/scripts/build-wardrobe-pieces.mjs",
];

export function prepareBuild(mode = "local") {
  const run = (script, ...args) => execFileSync(process.execPath, [script, ...args], { cwd: root, stdio: "inherit" });
  for (const script of syncScripts) run(script);
  if (mode === "staging") {
    run("frontend/scripts/prebuilt-colliders.mjs");
    return;
  }
  for (const script of colliderScripts) run(script, "--check");
  if (mode !== "colliders") for (const script of generatedScripts) run(script);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  prepareBuild(mode);
  if (mode === "colliders") (await import("./prebuilt-colliders.mjs")).writePrebuiltColliders();
}
