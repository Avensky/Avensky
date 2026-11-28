import assert from "node:assert/strict";
import test from "node:test";
import { catalogHairImage } from "../src/game/characters/catalogHairImage.ts";

const job = {
  hairstylePreview: true,
  look: { character: { id: "mara-vega" }, appearance: { hair: "hair-02" } },
};

test("a published hairstyle reopens from disk and a changed model or framing replaces its image", async t => {
  const saved = new Map();
  const cache = {
    match: async key => saved.get(key)?.clone(),
    put: async (key, response) => saved.set(key, response),
    keys: async () => [...saved.keys()],
    delete: async key => saved.delete(key),
  };
  t.after(() => { delete globalThis.caches; });
  globalThis.caches = { open: async () => cache };
  let rendered = 0;
  const render = async () => new Blob([String(++rendered)], { type: "image/webp" });
  const read = async (revision, release) => (await catalogHairImage(job, revision, release, render)).text();
  assert.equal(await read("bust", "release-a"), "1");
  assert.equal(await read("bust", "release-a"), "1");
  assert.equal(await read("bust", "release-b"), "2");
  assert.equal(await read("three-quarter", "release-b"), "3");
  assert.equal(saved.size, 1);
  assert.equal(await read("dev", undefined), "4");
  await catalogHairImage({ ...job, hairstylePreview: false }, "actor", "release-b", render);
  assert.equal(await read("three-quarter", "release-b"), "3");
  globalThis.caches.open = async () => { throw Error("storage blocked"); };
  assert.equal(await read("bust", "release-b"), "6");
});
