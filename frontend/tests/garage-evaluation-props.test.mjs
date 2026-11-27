import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { createRoot, extend, useLoader } from "@react-three/fiber";
import { act, createElement } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createServer } from "vite";
import { stagingRelease, trackedAssets } from "../scripts/staging-release.mjs";

const folder = "/models/world/garage-evaluation/";
const [cabinet, jack, crane] = ["cabinet", "car-jack", "engine-crane"].map(name => folder + name + ".glb");
const openModels = ["metal-tool-chest", "metal-shelf", "service-tire"]
  .map(name => `/open-art/garage/${name}/${name}.gltf`);
const catalog = JSON.parse(readFileSync(new URL("../scripts/staging-garage-evaluation.json", import.meta.url)));
const frontend = fileURLToPath(new URL("..", import.meta.url));

test("the three evaluation props are private staging entries outside the tracked game assets", () => {
  assert.deepEqual(Object.keys(catalog).sort(), [cabinet, jack, crane].sort());
  const { assets } = stagingRelease();
  const tracked = trackedAssets();
  for (const [path, entry] of Object.entries(catalog)) {
    assert.deepEqual(assets[path], entry, path);
    assert.equal(tracked[path], undefined, path);
  }
});

// Use the real menu, renderer, release gates and error boundaries. Stand in
// only for the GLB fetch and the browser canvas used to print the table map.
const fixture = "virtual:garage-prop-test";
const assetFixture = {
  name: "garage-prop-test",
  enforce: "pre",
  resolveId(id) {
    if (id === fixture || id.endsWith("/useAssetGLTF") || id === "./garageRoutePlan") return "\0" + fixture;
  },
  load(id) {
    if (id === "\0" + fixture) return `
      import { Texture } from "three";
      export const garageRoutePlan = () => new Texture();
      let read;
      export const setLoader = loader => { read = loader; };
      export const useAssetGLTF = url => read(url);
    `;
  },
};

before(() => {
  extend(THREE);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
after(() => { delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

async function withGarageRenderer(paths, run) {
  const vite = await createServer({ root: frontend, plugins: [assetFixture], logLevel: "error", appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    define: { __STAGING_ASSET_RELEASE__: JSON.stringify(paths && { id: "a".repeat(64), paths }) } });
  const renderer = createRoot(new EventTarget());
  try {
    await renderer.configure({ frameloop: "never", size: { width: 960, height: 540, top: 0, left: 0 },
      gl: { render() {}, setSize() {}, setPixelRatio() {}, getPixelRatio: () => 1 } });
    const load = file => vite.ssrLoadModule("/src/game/preview/" + file);
    const render = async element => {
      let store;
      await act(async () => { store = renderer.render(element); });
      return store.getState().scene;
    };
    const { setLoader } = await vite.ssrLoadModule(fixture);
    return await run({ load, render, setLoader });
  } finally {
    await act(async () => renderer.unmount());
    await vite.close();
  }
}

function renderWorkshop(paths, unavailable) {
  return withGarageRenderer(paths, async ({ load, render, setLoader }) => {
    const { GarageMenuFurnishings } = await load("GarageMenuFurnishings.tsx");
    const requests = new Set(), models = new Map();
    setLoader(url => {
      requests.add(url);
      if (url === unavailable) throw Error("Missing evaluation fixture");
      if (!models.has(url)) {
        const scene = new THREE.Group();
        scene.name = url;
        models.set(url, { scene });
      }
      return models.get(url);
    });
    const scene = await render(createElement(GarageMenuFurnishings));
    assert.ok(scene.getObjectByName("garage-menu-furnishings"));
    for (const url of openModels) assert.ok(scene.getObjectByName(url), url);
    for (const url of requests) assert.equal(Boolean(scene.getObjectByName(url)), url !== unavailable, url);
    return { requests, steelCount: scene.getObjectByName("garage-furnishing-steel").count };
  });
}

test("the workshop keeps its public furnishings in production and when an optional staging prop fails", async t => {
  const report = console.error;
  t.mock.method(console, "error", (...args) => {
    if (args[0]?.message !== "Missing evaluation fixture") report(...args);
  });
  const production = await renderWorkshop(null);
  assert.deepEqual(production.requests, new Set(openModels));

  const partial = await renderWorkshop({ [cabinet]: true, [crane]: true }, cabinet);
  assert.deepEqual(partial.requests, new Set([...openModels, cabinet, crane]));
  assert.equal(partial.steelCount, production.steelCount, "keep the fallback locker after a failed fetch");

  const ready = await renderWorkshop(catalog);
  assert.deepEqual(ready.requests, new Set([...openModels, cabinet, jack, crane]));
  assert.ok(ready.steelCount < production.steelCount, "hide the fallback locker after its replacement has mounted");
});

test("the persistent door bank draws the entry locally and promotes all three shutters with one shared model", async t => {
  const door = "/open-art/garage/garage-door/garage-door.gltf";
  const request = Promise.withResolvers(), surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const model = new THREE.Group(); model.add(surface);
  const loads = t.mock.method(GLTFLoader.prototype, "load", (url, onLoad) => {
    assert.equal(url, door);
    request.promise.then(() => onLoad({ scene: model }));
  });
  try {
    await withGarageRenderer(null, async ({ load, render }) => {
      const { GarageDoorWall } = await load("GarageDoorWall.tsx");
      const room = detailed => createElement(GarageDoorWall, { detailed });
      const scene = await render(room(false));
      const shutters = () => scene.getObjectByName("garage-bay-shutters");
      const slats = () => scene.getObjectByName("garage-bay-slats");
      const frames = scene.getObjectByName("garage-bay-frames");
      const signs = scene.getObjectByName("garage-personnel-exit-signs");
      assert.ok(frames?.isInstancedMesh && signs?.isInstancedMesh && slats()?.isInstancedMesh);
      assert.equal(shutters(), undefined);
      assert.equal(loads.mock.callCount(), 0, "signed-out entry never requests the detailed shutter");

      await render(room(true));
      assert.ok(slats(), "the closed, ribbed fallback stays visible during download");
      await act(async () => request.resolve());
      const detailed = shutters();
      assert.ok(detailed?.isInstancedMesh);
      assert.equal(detailed.count, 3);
      assert.equal(detailed.geometry, surface.geometry);
      assert.equal(slats(), undefined);
      assert.equal(scene.getObjectByName("garage-bay-frames"), frames);
      assert.equal(scene.getObjectByName("garage-personnel-exit-signs"), signs);
      assert.equal(loads.mock.callCount(), 1);
    });
  } finally {
    useLoader.clear(GLTFLoader, door);
    surface.geometry.dispose();
    surface.material.dispose();
  }
});
