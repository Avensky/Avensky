import { createHash } from "node:crypto";
import { once } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssetUrl } from "../src/assets/assetPaths.ts";
import { sealRelease, validateRelease, stagingRelease } from "../scripts/staging-release.mjs";
import { checkPrebuiltColliders } from "../scripts/prebuilt-colliders.mjs";
import { assetGateway } from "../../deploy/staging-assets/gateway.mjs";
import { checkDependencies, verifyObject } from "../../deploy/staging-assets/verify-release.mjs";
import { signedObjectReader } from "../../deploy/staging-assets/object-store.mjs";

const path = "/models/city/a, b.glb";
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
  const server = assetGateway([{ ...release, objects: { [path]: { etag, layout: "flat" } } }], async (key, request) => {
    calls++;
    assert.equal(key, "staging" + path);
    assert.equal(request.etag, etag);
    if (outcome === "missing") return new Response(null, { status: 404 });
    if (outcome === "redirect") return Response.redirect("https://private.invalid/object?secret=1");
    const payload = request.range ? bytes.subarray(0, 4) : bytes;
    const headers = { "Content-Length": String(payload.length), etag: outcome === "changed" ? '"different"' : etag };
    if (request.range) headers["Content-Range"] = "bytes 0-3/" + bytes.length;
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
  for (const [result, status] of [["missing", 404], ["redirect", 502], ["changed", 502]]) {
    outcome = result;
    const response = await fetch(base + url);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("location"), null);
    assert.doesNotMatch(await response.text(), /secret|private.invalid/);
  }
});
