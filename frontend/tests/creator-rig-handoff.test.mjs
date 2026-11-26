import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test("rig handoff keeps the displayed actor while loading, cancels stale swaps, and skips motion on request", async () => {
  const dom = new JSDOM('<main></main>');
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  const media = { matches: false };
  window.matchMedia = () => media;
  const root = createRoot(document.querySelector("main"));
  const vite = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", logLevel: "error",
    plugins: [{
      name: "single-actor-test",
      transform(source, id) {
        if (id.endsWith("/RosterRigHandoff.tsx")) return source.replace(/from "(?:@react-three\/fiber|\.\.\/\.\.\/store\/preferences\/preferencesStore|\.\.\/preview\/GarageMaterialization)"/g, 'from "virtual:handoff"');
      },
      resolveId(id) { if (id === "virtual:handoff") return id; },
      load(id) {
        if (id === "virtual:handoff") return `
          import { createElement } from "react";
          const invalidate = () => {};
          export const useThree = f => f({ invalidate });
          let frame;
          export const useFrame = f => { frame = f; };
          export const tick = elapsed => frame(null, elapsed);
          export const usePreferencesStore = f => f({ reducedMotion: false });
          export const GarageMaterialization = ({ active }) => createElement("i", { "data-playing": active });
        `;
      },
    }],
  });
  try {
    const { RosterRigHandoff } = await vite.ssrLoadModule("/src/game/characters/RosterRigHandoff.tsx");
    const { tick } = await vite.ssrLoadModule("virtual:handoff");
    const preview = id => ({ look: { character: { id } } });
    const a = preview("a"), b = preview("b");
    let coverage;
    const render = (look, requested, creating = true) => act(async () => root.render(createElement(RosterRigHandoff,
      { preview: look, requested, creating }, (shown, value) => {
        coverage = value;
        return createElement("span", { "data-rig": shown.look.character.id });
      })));
    const shown = () => [...document.querySelectorAll("[data-rig]")].map(node => node.dataset.rig);
    const playing = () => !!document.querySelector('[data-playing="true"]');
    const frames = async n => { for (let i = 0; i < n; ++i) await act(async () => tick(.06)); };
    await render(a, "a", false);
    assert.deepEqual(shown(), ["a"]);
    assert.equal(playing(), false);
    await render(a, "a"); // Entering creation while the same character is displayed.
    assert.equal(playing(), true);
    await frames(13);
    assert.equal(coverage.value, 1);
    await render(a, "b"); // No new prepared rig while the request is pending.
    assert.deepEqual(shown(), ["a"]);
    assert.equal(playing(), false);
    await render(b, "b"); await frames(2);
    assert.ok(coverage.value < 1 && coverage.value > 0);
    await render(a, "a"); await frames(12);
    assert.deepEqual(shown(), ["a"]);
    assert.equal(playing(), false);
    await render(b, "b"); await frames(6);
    assert.deepEqual(shown(), ["b"]);
    await frames(7);
    assert.equal(coverage.value, 1);
    media.matches = true;
    await render(a, "a");
    assert.deepEqual(shown(), ["a"]);
    assert.equal(playing(), false);
  } finally {
    await act(async () => root.unmount());
    await vite.close();
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
