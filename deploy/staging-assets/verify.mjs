import { renameSync, writeFileSync } from "node:fs";
import { readRelease } from "../../frontend/scripts/staging-release.mjs";
import { signedObjectReader } from "./object-store.mjs";
import { verifyStoredObject } from "./verify-release.mjs";

const [file, output, option, ...extra] = process.argv.slice(2);
if (!file || !output || file === output || (option && option !== "--models-root") || extra.length) {
  throw new Error("Usage: verify.mjs <input-manifest> <verified-output> [--models-root]");
}
const release = readRelease(file);
const { id, assets } = release;
const read = signedObjectReader();
const entries = Object.entries(assets);
const pending = entries.values();
const verified = new Map();
let failed = 0;
async function verifyNext() {
  for (const [path, entry] of pending) {
    try {
      const object = await verifyStoredObject(read, path, entry, assets, {
        signal: AbortSignal.timeout(180_000),
        preferModelsRoot: option === "--models-root",
      });
      verified.set(path, object);
    } catch (error) {
      // The fetch error cause may carry the signed upstream address.
      console.error("%s: %s", path, error.message);
      failed++;
    }
  }
}
// Bound simultaneous connections and signing processes while streaming the release once.
await Promise.all(Array.from({ length: 6 }, verifyNext));
if (failed) {
  console.error("%d of %d staging assets failed verification", failed, entries.length);
  process.exitCode = 1;
} else {
  const objects = Object.fromEntries(entries.map(([path]) => [path, verified.get(path)]));
  const temporary = output + "." + process.pid;
  writeFileSync(temporary, JSON.stringify({ release, objects }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(temporary, output);
  console.log("Verified %d private objects for staging release %s", entries.length, id);
}
