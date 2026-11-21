import { renameSync, writeFileSync } from "node:fs";
import { readRelease } from "../../frontend/scripts/staging-release.mjs";
import { signedObjectReader, storageKey } from "./object-store.mjs";
import { verifyObject } from "./verify-release.mjs";

const [file, output] = process.argv.slice(2);
if (!file || !output || file === output) throw new Error("Pass the input manifest and a distinct verified release output path");
const release = readRelease(file);
const { id, assets } = release;
const read = signedObjectReader();
const entries = Object.entries(assets);
const objects = {};
let failed = 0;
for (const [path, entry] of entries) {
  try {
    const options = { signal: AbortSignal.timeout(180_000) };
    let layout = "digest";
    let object = await read(storageKey(path, entry.sha256, layout), options);
    if (object.status === 403 || object.status === 404) {
      await object.body?.cancel();
      layout = "flat";
      object = await read(storageKey(path, entry.sha256, layout), options);
    }
    objects[path] = { layout, etag: await verifyObject(object, path, entry, assets) };
  } catch (error) {
    // The fetch error cause may carry the signed upstream address.
    console.error("%s: %s", path, error.message);
    failed++;
  }
}
if (failed) {
  console.error("%d of %d staging assets failed verification", failed, entries.length);
  process.exitCode = 1;
} else {
  const temporary = output + "." + process.pid;
  writeFileSync(temporary, JSON.stringify({ release, objects }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(temporary, output);
  console.log("Verified %d private objects for staging release %s", entries.length, id);
}
