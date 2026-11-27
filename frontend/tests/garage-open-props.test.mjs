import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Children, act, createElement, isValidElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const assets = new URL("../public/open-art/garage/", import.meta.url);
const slugs = ["garage-door", "metal-shelf", "metal-tool-chest", "service-tire"];

test("the published garage props are credited, self-contained glTFs within the mobile menu budget", async () => {
  const folders = await readdir(assets, { withFileTypes: true });
  assert.deepEqual(folders.filter(entry => entry.isDirectory()).map(entry => entry.name).sort(), slugs);
  let bytes = 0;
  for (const slug of slugs) {
    const folder = new URL(slug + "/", assets);
    const data = await readFile(new URL(slug + ".gltf", folder));
    const model = JSON.parse(data);
    bytes += data.length;
    assert.equal(model.asset.version, "2.0", slug);
    const { author, title, source, license, changes } = model.asset.extras;
    for (const field of [author, title, changes]) assert.ok(typeof field === "string" && field.trim(), slug);
    assert.ok(model.asset.copyright.includes(author), slug);
    assert.match(source, /^https?:\/\//, slug);
    assert.ok(["https://creativecommons.org/licenses/by/4.0/", "https://creativecommons.org/publicdomain/zero/1.0/"].includes(license), slug);
    assert.equal(model.meshes.length, 1, slug);
    assert.equal(model.meshes[0].primitives.length, 1, slug);
    assert.equal(model.materials.length, 1, slug);
    assert.equal(model.meshes[0].primitives[0].material, 0, slug);
    assert.ok(model.buffers.length > 0, slug);
    const filenames = new Set();
    for (const dependency of [...model.buffers, ...(model.images ?? [])]) {
      const { uri } = dependency;
      assert.match(uri, /^(?:geometry-[a-f0-9]{12}\.bin|map-[a-f0-9]{12}\.jpg)$/, slug);
      const file = await readFile(new URL(uri, folder));
      const checksum = createHash("sha256").update(file).digest("hex").slice(0, 12);
      assert.ok(uri.includes(checksum), uri);
      if ("byteLength" in dependency) assert.equal(file.length, dependency.byteLength, uri);
      if (!filenames.has(uri)) bytes += file.length;
      filenames.add(uri);
    }
    for (const view of model.bufferViews)
      assert.ok((view.byteOffset ?? 0) + view.byteLength <= model.buffers[view.buffer].byteLength, slug);
  }
  assert.ok(bytes < 1024 * 1024, `The garage props transfer ${bytes} bytes`);
});

test("the shared garage mounts its workshop furnishings only while the main menu is visible", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const env = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map(Object.keys(env).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let server, root;
  try {
    for (const [key, value] of Object.entries(env))
      Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
    server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)),
      server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" });
    const { RosterGaragePreview } = await server.ssrLoadModule("/src/game/preview/RosterGaragePreview.tsx");
    const { GarageMenuFurnishings } = await server.ssrLoadModule("/src/game/preview/GarageMenuFurnishings.tsx");
    const containsFurnishings = element => isValidElement(element) && (element.type === GarageMenuFurnishings ||
      Children.toArray(element.props.children).some(containsFurnishings));
    root = createRoot(document.getElementById("root"));
    let visitedMain = false;
    for (const mode of ["roster", "create", "main", "profile", "main", "roster"]) {
      await act(() => root.render(createElement(RosterGaragePreview, { mode })));
      const runtime = globalThis.__avenskyGarage;
      visitedMain ||= mode === "main";
      assert.equal(containsFurnishings(runtime.preview.contents), mode === "main", mode);
      assert.equal(Boolean(runtime.detailedBayDoors), visitedMain, "door detail stays mounted after first main-menu visit");
    }
  } finally {
    if (root) await act(() => root.unmount());
    if (server) await server.close();
    dom.window.close();
    for (const [key, descriptor] of saved)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  }
});
