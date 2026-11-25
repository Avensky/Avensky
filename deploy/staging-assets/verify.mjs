import { renameSync, writeFileSync } from "node:fs";
import { readRelease } from "../../frontend/scripts/staging-release.mjs";
import { signedObjectReader } from "./object-store.mjs";
import { readVerifiedRelease, reusableVerifiedObject, verifyStoredObject } from "./verify-release.mjs";

const [file, output, ...options] = process.argv.slice(2);
let preferModelsRoot = false;
let previousFile;
let invalid = false;
for (let i = 0; i < options.length; i++) {
  const option = options[i];
  if (option === "--models-root" && !preferModelsRoot) preferModelsRoot = true;
  else if (option === "--reuse-verified" && !previousFile && options[i + 1]) previousFile = options[++i];
  else invalid = true;
}
if (!file || !output || file === output || output === previousFile || invalid) {
  throw new Error("Usage: verify.mjs <candidate> <verified-output> [--models-root] [--reuse-verified <trusted-existing-verified.json>]");
}
const release = readRelease(file);
const previous = previousFile ? readVerifiedRelease(previousFile) : null;
const { id, assets } = release;
const verified = new Map();
const pending = [];
let reused = 0;
for (const [path, entry] of Object.entries(assets)) {
  const proof = reusableVerifiedObject(previous, path, entry);
  if (proof) {
    verified.set(path, proof);
    reused++;
  } else {
    pending.push([path, entry]);
  }
}
const read = signedObjectReader();
const iterator = pending.values();
let failed = 0;
async function verifyNext() {
  for (const [path, entry] of iterator) {
    try {
      const object = await verifyStoredObject(read, path, entry, assets, {
        signal: AbortSignal.timeout(180_000),
        preferModelsRoot,
      });
      verified.set(path, object);
    } catch (error) {
      // The fetch error cause may carry the signed upstream address.
      console.error("%s: %s", path, error.message);
      failed++;
    }
  }
}
// Bound simultaneous connections and signing processes while streaming new objects once.
await Promise.all(Array.from({ length: 6 }, verifyNext));
if (failed) {
  console.error("%d of %d staging assets failed verification", failed, pending.length);
  process.exitCode = 1;
} else {
  const objects = Object.fromEntries(Object.keys(assets).map(path => [path, verified.get(path)]));
  const temporary = output + "." + process.pid;
  writeFileSync(temporary, JSON.stringify({ release, objects }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(temporary, output);
  console.log("Verified %d private objects for staging release %s (%d reused, %d checked)",
    Object.keys(assets).length, id, reused, pending.length);
}
