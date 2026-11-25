import { createHash } from "node:crypto";
import { once } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetUrl } from "../src/assets/assetPaths.ts";
import { sealRelease, validateRelease, stagingRelease } from "../scripts/staging-release.mjs";
import { checkPrebuiltColliders } from "../scripts/prebuilt-colliders.mjs";
import { assetGateway } from "../../deploy/staging-assets/gateway.mjs";
import { checkDependencies, verifyObject, verifyStoredObject } from "../../deploy/staging-assets/verify-release.mjs";
import { signedObjectReader, storageKey } from "../../deploy/staging-assets/object-store.mjs";

const path = "/models/city/a, b.glb";

test("staging includes only the requested privately installed hair and preserves the accessory catalog", () => {
  const baseline = stagingRelease(undefined, "");
  const pilot = stagingRelease(undefined, "hair-12");
  const all = stagingRelease(undefined, "all");
  const paths = release => Object.keys(release.assets).filter(url => url.startsWith("/models/characters/female/hair/"));
  assert.equal(paths(baseline).length, 0);
  assert.deepEqual(paths(pilot), ["/models/characters/female/hair/Hair_12_espresso.glb"]);
  assert.equal(paths(all).length, 12);
  assert.notEqual(pilot.id, baseline.id);
  assert.deepEqual(all.assets["/models/characters/female/wardrobe/bracers/bracer-01.garage.glb"],
    baseline.assets["/models/characters/female/wardrobe/bracers/bracer-01.garage.glb"]);
  assert.throws(() => stagingRelease(undefined, "unlisted"), /Unknown fitted hairstyle/);
});
const nextLod = "/models/city/a-low.glb";
const texture = "/textures/a.webp";
const etag = '"' + "a".repeat(32) + '"';

function glb(document) {
  const json = JSON.stringify(document);
  const padded = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4));
  const header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(header.length + padded.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, padded]);
}

function entry(bytes) {
  return { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
}
const bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "../../textures/a.webp" }] });
const release = sealRelease({ assets: { [path]: entry(bytes), [nextLod]: entry(Buffer.from("lod")), [texture]: entry(Buffer.from("texture")) } });
const config = { id: release.id, paths: release.assets };
const url = resolveAssetUrl(path + "?v=old", config);

test("staging uses versioned same-origin URLs and preserves authored tier selection", () => {
  assert.equal(url, "/__staging-assets/" + release.id + "/models/city/a%2C%20b.glb");
  assert.equal(resolveAssetUrl(path, config), url);
  assert.notEqual(resolveAssetUrl(nextLod, config), url);
  assert.equal(new URL("../../textures/a.webp", "https://staging.invalid" + url).pathname, resolveAssetUrl(texture, config));
  assert.equal(resolveAssetUrl("/draco/draco_decoder.wasm", config), "/draco/draco_decoder.wasm");
  assert.equal(resolveAssetUrl(path + "?v=old", null), path + "?v=old");
  assert.throws(() => resolveAssetUrl("/models/retired.glb", config), /missing from release/);
});

test("the pointer checkout has a valid release and checked collision data", () => {
  const baseline = stagingRelease();
  assert.ok(Object.keys(baseline.assets).length > 500);
  assert.ok(baseline.assets["/models/world/garage_special.glb"].size > 1000);
  assert.deepEqual(validateRelease(baseline), baseline);
  assert.doesNotThrow(checkPrebuiltColliders);
  assert.throws(() => validateRelease({ ...release, assets: { ...release.assets, [path]: { ...release.assets[path], size: 1 } } }), /digest/);
  assert.throws(() => validateRelease(sealRelease({ assets: release.assets, previews: { brz: "/models/heroes-generated/brz.glb" } })), /preview/);
});

test("publication verification checks the GLB, external texture, length, ETag, and SHA-256", async () => {
  const resource = () => new Response(bytes, { headers: { etag } });
  assert.equal(await verifyObject(resource(), path, entry(bytes), release.assets), etag);
  await assert.rejects(verifyObject(resource(), path, { ...entry(bytes), sha256: "0".repeat(64) }, release.assets), /SHA-256/);
  await assert.rejects(verifyObject(resource(), path, entry(bytes), {}), /missing from the release/);
  await assert.rejects(verifyObject(new Response(bytes), path, entry(bytes), release.assets), /ETag/);
  assert.throws(() => checkDependencies(path, { images: [{ uri: "https://example.com/a.png" }] }, release.assets), /relative/);
  assert.throws(() => checkDependencies(path, { images: [{ uri: "../../../../textures/a.webp" }] }, release.assets), /missing/);
});

test("verification reuses the existing model-root keys and falls back only when a key is unavailable", async () => {
  const keys = [];
  const model = release.assets[path];
  const rootKey = "staging/city/a, b.glb";
  const digestKey = "staging/objects/" + model.sha256;
  const read = async key => {
    keys.push(key);
    return key === rootKey ? new Response(bytes, { headers: { etag } }) : new Response(null, { status: 403 });
  };
  const expected = { layout: "models-root", etag };
  assert.deepEqual(await verifyStoredObject(read, path, model, release.assets, {}), expected);
  assert.deepEqual(keys.splice(0), [digestKey, rootKey]);
  assert.deepEqual(
    await verifyStoredObject(read, path, model, release.assets, { preferModelsRoot: true }), expected,
  );
  assert.deepEqual(keys.splice(0), [rootKey]);
  const corrupt = async key => {
    keys.push(key);
    return new Response(bytes.subarray(0, 4), { headers: { etag } });
  };
  await assert.rejects(verifyStoredObject(corrupt, path, model, release.assets, {}), /SHA-256 or byte count/);
  assert.deepEqual(keys, [digestKey]);
  assert.throws(() => storageKey(texture, release.assets[texture].sha256, "models-root"), /Unsupported storage layout/);
});

test("private object reader coalesces signing and pins the verified storage ETag", async () => {
  let signCalls = 0;
  const read = signedObjectReader(async () => {
    signCalls++;
    return new URL("https://private.invalid/object?signature=server-only");
  }, async (target, options) => {
    assert.equal(target.hostname, "private.invalid");
    assert.equal(options.headers["If-Match"], etag);
    assert.equal(options.redirect, "error");
    return new Response(bytes);
  });
  await Promise.all([read("hash", { etag }), read("hash", { etag })]);
  assert.equal(signCalls, 1);
});

test("gateway serves only verified assets and keeps failures and redirects out of cache", async t => {
  let calls = 0;
  let outcome = "ok";
  const server = assetGateway([{ ...release, objects: { [path]: { etag, layout: "models-root" } } }], async (key, request) => {
    calls++;
    assert.equal(key, "staging/city/a, b.glb");
    assert.equal(request.etag, etag);
    if (outcome === "missing") return new Response(null, { status: 404 });
    if (outcome === "redirect") return Response.redirect("https://private.invalid/object?secret=1");
    const selected = request.range?.match(/^bytes=(\d+)-(\d+)$/);
    const start = selected ? Number(selected[1]) : 0;
    const end = selected ? Number(selected[2]) : bytes.length - 1;
    const payload = bytes.subarray(start, end + 1);
    const headers = { "Content-Length": String(payload.length), etag: outcome === "changed" ? '"different"' : etag };
    if (selected) headers["Content-Range"] = outcome === "wrong-range"
      ? `bytes ${start + 1}-${end + 1}/${bytes.length}`
      : `bytes ${start}-${end}/${bytes.length}`;
    return new Response(payload, { status: request.range ? 206 : 200, headers });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = "http://127.0.0.1:" + server.address().port;
  assert.equal((await fetch(base + url + "?bad=1")).status, 404);
  assert.equal((await fetch(base + url.replace(release.id, "0".repeat(64)))).status, 404);
  assert.equal((await fetch(base + url, { method: "POST" })).status, 405);
  assert.equal((await fetch(base + url, { headers: { Range: "bytes=0-1,3-4" } })).status, 416);
  assert.equal((await fetch(base + url, { headers: { Range: "bytes=-0" } })).status, 416);
  const outside = await fetch(base + url, { headers: { Range: `bytes=${bytes.length}-` } });
  assert.equal(outside.status, 416);
  assert.equal(outside.headers.get("content-range"), `bytes */${bytes.length}`);
  assert.equal(calls, 0);
  const model = await fetch(base + url);
  assert.equal(model.status, 200);
  assert.equal(model.headers.get("content-type"), "model/gltf-binary");
  assert.match(model.headers.get("cache-control"), /^private, /);
  assert.deepEqual(Buffer.from(await model.arrayBuffer()), bytes);
  const head = await fetch(base + url, { method: "HEAD" });
  assert.equal(head.headers.get("content-length"), String(bytes.length));
  assert.equal(await head.text(), "");
  const range = await fetch(base + url, { headers: { Range: "bytes=0-3" } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), "glTF");
  for (const header of ["bytes=-4", `bytes=${bytes.length - 4}-`, `bytes=${bytes.length - 4}-99999`]) {
    const tail = await fetch(base + url, { headers: { Range: header } });
    assert.equal(tail.status, 206);
    assert.deepEqual(Buffer.from(await tail.arrayBuffer()), bytes.subarray(-4));
  }
  const conditional = await fetch(base + url, { headers: { Range: "bytes=0-3", "If-Range": etag } });
  assert.equal(conditional.status, 200);
  assert.deepEqual(Buffer.from(await conditional.arrayBuffer()), bytes);
  outcome = "wrong-range";
  const wrongRange = await fetch(base + url, { headers: { Range: "bytes=0-3" } });
  assert.equal(wrongRange.status, 502);
  assert.equal(wrongRange.headers.get("cache-control"), "no-store");
  for (const [result, status] of [["missing", 404], ["redirect", 502], ["changed", 502]]) {
    outcome = result;
    const response = await fetch(base + url);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("location"), null);
    assert.doesNotMatch(await response.text(), /secret|private.invalid/);
  }
});
