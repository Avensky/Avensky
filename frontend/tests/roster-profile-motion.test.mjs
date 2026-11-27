import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRoot, extend } from "@react-three/fiber";
import { JSDOM } from "jsdom";
import { act, createElement, Fragment, useSyncExternalStore } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createServer } from "vite";

test("the same gesture keeps advancing through roster, profile and back", async t => {
  const dom = new JSDOM("<canvas></canvas>", { url: "http://localhost/", pretendToBeVisual: true });
  const { window } = dom;
  const globals = { window, document: window.document, localStorage: window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window) };
  const original = new Map();
  for (const [name, value] of Object.entries(globals)) {
    original.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  let vite, renderer;
  try {
    // Use the game's real animation player and the stock actor's exported skeleton.
    // The headless renderer samples bones without GPU draws.
    const model = await new GLTFLoader().parseAsync(await readFile("tests/fixtures/villager-male-rig.json", "utf8"), "");
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error",
      define: { __STAGING_ASSET_RELEASE__: "null", __ROOK_MODEL_URL__: JSON.stringify("/models/actor.glb"), __ROOK_PORTRAIT_URL__: JSON.stringify("/models/actor.glb") },
      plugins: [{
        name: "roster-test-rig", enforce: "pre",
        resolveId(id, importer) {
          if (id === "virtual:roster-rig" || (id === "../../assets/useAssetGLTF" && importer?.endsWith("/GarageDriver.tsx"))) return "\0roster-rig";
        },
        load(id) { if (id === "\0roster-rig") return "let rig; export const setRig = model => { rig = model; }; export const useAssetGLTF = () => rig;"; },
      }] });
    (await vite.ssrLoadModule("virtual:roster-rig")).setRig(model);
    const { RosterGaragePreview } = await vite.ssrLoadModule("/src/game/preview/RosterGaragePreview.tsx");
    // Resolve the lazy component before driving the deterministic frame clock.
    await vite.ssrLoadModule("/src/game/characters/GarageDriver.tsx");
    const { RosterEmotePlayback } = await vite.ssrLoadModule("/src/game/characters/rosterEmotePlayback.ts");
    const choice = { id: "jules-okafor", outfit: "night-run" };
    const canvas = document.querySelector("canvas");
    extend(THREE);
    renderer = createRoot(canvas);
    await renderer.configure({ frameloop: "never", size: { width: 812, height: 375, top: 0, left: 0 },
      gl: { domElement: canvas, render() {}, setSize() {}, setPixelRatio() {}, getPixelRatio: () => 1 } });
    const runtime = globalThis.__avenskyGarage;
    const subscribe = listener => {
      runtime.listeners.add(listener);
      return () => runtime.listeners.delete(listener);
    };
    function GarageContents() {
      return useSyncExternalStore(subscribe, () => runtime.preview?.contents ?? null);
    }
    let store, now = performance.now();
    const paint = mode => act(async () => {
      store = renderer.render(createElement(Fragment, null,
        createElement(RosterGaragePreview, { choice, mode }), createElement(GarageContents)));
    });
    t.mock.method(performance, "now", () => now);
    let sampled;
    const update = RosterEmotePlayback.prototype.update;
    t.mock.method(RosterEmotePlayback.prototype, "update", function (delta) {
      sampled = this.active;
      return update.call(this, delta);
    });
    const advance = () => act(async () => {
      for (let i = 0; i < 8; i++) store.getState().advance((now += 16) / 1000, false);
    });

    await paint("roster");
    await advance();
    assert.ok(sampled?.time > 0, "the roster is partway through a gesture");
    const action = sampled, rig = action.getRoot();
    for (const mode of ["profile", "roster"]) {
      const previous = action.time;
      await paint(mode);
      assert.equal(runtime.preview.demand, true);
      assert.equal(store.getState().scene.getObjectByName(rig.name), rig);
      await advance();
      assert.equal(sampled, action, "the panel keeps the same animation action and its mixer");
      assert.ok(action.time > previous, "the gesture continues from its previous frame");
    }
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
