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
const openModels = ["metal-tool-chest", "metal-shelf"]
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

function renderWorkshop(paths, attempts = [null]) {
  return withGarageRenderer(paths, async ({ load, render, setLoader }) => {
    const { GarageMenuFurnishings } = await load("GarageMenuFurnishings.tsx");
    const { DEFAULT_GARAGE_LAYOUT: layout, CRANE_SCALE } = await load("garageServiceLayout.ts");
    const results = [];
    for (const unavailable of attempts) {
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
      const scene = await render(createElement(GarageMenuFurnishings, { key: unavailable ?? "ready" }));
      assert.ok(scene.getObjectByName("garage-menu-furnishings"));
      assert.equal(scene.getObjectByName("garage-furnishing-rubber").count, 4, "shelved tires share one draw");
      assert.equal(scene.getObjectByName("service-tire"), undefined, "no loose tire on the workshop floor");
      for (const url of openModels) assert.ok(scene.getObjectByName(url), url);
      for (const url of requests) assert.equal(Boolean(scene.getObjectByName(url)), url !== unavailable, url);
      const visible = {};
      for (const [name, placement, key] of [
        ["garage-floor-jack", layout.jack, "jack"], ["garage-engine-hoist", layout.crane, "crane"],
      ]) {
        const tool = scene.getObjectByName(name);
        assert.ok(tool?.isMesh && !tool.children.length, "one static draw per original tool");
        assert.deepEqual(tool.position.toArray(), [placement.x, 0, placement.z]);
        assert.equal(tool.rotation.y, placement.yaw);
        assert.equal(tool.scale.x, key === "crane" ? CRANE_SCALE : 1);
        assert.ok(tool.geometry.attributes.color && tool.material.vertexColors, "retain the painted hardware finish");
        visible[key] = tool.visible;
      }
      results.push({ requests, visible, steelCount: scene.getObjectByName("garage-furnishing-steel").count });
    }
    return results;
  });
}

test("the workshop keeps its public furnishings in production and when an optional staging prop fails", async t => {
  const report = console.error;
  t.mock.method(console, "error", (...args) => {
    if (args[0]?.message !== "Missing evaluation fixture") report(...args);
  });
  const [production] = await renderWorkshop(null);
  assert.deepEqual(production.requests, new Set(openModels));
  assert.deepEqual(production.visible, { jack: true, crane: true });

  const [partial] = await renderWorkshop({ [cabinet]: true, [crane]: true }, [cabinet]);
  assert.deepEqual(partial.requests, new Set([...openModels, cabinet, crane]));
  assert.equal(partial.steelCount, production.steelCount, "keep the fallback locker after a failed fetch");
  assert.deepEqual(partial.visible, { jack: true, crane: false }, "each installed prop replaces only its own original");
  const [missingCrane, missingJack, ready] = await renderWorkshop(catalog, [crane, jack, null]);
  assert.deepEqual(missingCrane.visible, { jack: false, crane: true }, "a failed crane request keeps the hoist visible");
  assert.deepEqual(missingJack.visible, { jack: true, crane: false }, "a failed jack request keeps the jack visible");

  assert.deepEqual(ready.requests, new Set([...openModels, cabinet, jack, crane]));
  assert.deepEqual(ready.visible, { jack: false, crane: false });
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

test("moving the shelf updates four tires and its detailed model without replacing the room geometry", async () => {
  await withGarageRenderer(null, async ({ load, render, setLoader }) => {
    const { GarageMenuFurnishings } = await load("GarageMenuFurnishings.tsx");
    const { usePersonalGarage } = await load("../../store/social/personalGarage.ts");
    const { DEFAULT_GARAGE_LAYOUT } = await load("garageServiceLayout.ts");
    const art = new THREE.Group();
    setLoader(() => ({ scene: art }));
    const scene = await render(createElement(GarageMenuFurnishings));
    const tires = scene.getObjectByName("garage-furnishing-rubber");
    const mirror = scene.getObjectByName("garage-furnishing-glass");
    const shelf = scene.getObjectByName("metal-shelf");
    const position = new THREE.Matrix4();
    tires.getMatrixAt(0, position);
    const old = position.clone();
    const mirrorVersion = mirror.instanceMatrix.version;
    const shelfPose = { x: 7.95, z: 4.55, yaw: Math.PI / 2 };
    await act(() => usePersonalGarage.setState({ layout: { ...DEFAULT_GARAGE_LAYOUT, shelf: shelfPose } }));
    assert.equal(scene.getObjectByName("garage-furnishing-rubber"), tires);
    assert.equal(scene.getObjectByName("metal-shelf"), shelf);
    assert.equal(mirror.instanceMatrix.version, mirrorVersion, "unaffected batches keep their buffers");
    assert.equal(shelf.rotation.y, shelfPose.yaw);
    assert.deepEqual(shelf.position.toArray(), [7.95, 0, 4.55]);
    tires.getMatrixAt(0, position);
    assert.ok(!position.equals(old));
    assert.ok(Math.abs(position.elements[12] - 7.95) < 1e-5);
    assert.ok(Math.abs(position.elements[14] - 4.925) < 1e-5);
  });
});
