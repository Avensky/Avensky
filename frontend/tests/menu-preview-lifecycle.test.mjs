import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { Children, act, createElement, isValidElement } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

const surface = "virtual:preview-lifecycle";
const surfaceId = "\0" + surface;

// Exercise the real App, menu routing, garage handoff and FullCanvas. Replace
// networking, controls, UI panels and the world renderer at their boundaries.
function testSurfaces() {
  const retained = new Set(["react", "../FullCanvas", "./store/menus/uiStore",
    "./game/welcome/GarageMenuBackdrop", "./game/preview/RosterGaragePreview"]);
  const stubs = {
    useSocialStore: "select => select({})",
    useBuilderStore: 'select => select({ workspace: "world" })',
    useRenderSettingsStore: "select => select({ hud: false })",
    Sandbox: "() => <span data-sandbox />",
    Cameras: "() => <span data-gameplay-camera />",
  };
  return {
    name: "preview-lifecycle-test-surfaces", enforce: "pre",
    transform(source, id) {
      if (id.endsWith("/src/App.tsx") || id.endsWith("/game/GameUI.tsx") || id.endsWith("/modes/WorldContents.tsx")) {
        return source.replace(/import\("(?:\.\/heroes\/HeroWorkshop|\.\.\/ui\/DrivingHUD)"\)/g, `import("${surface}")`)
          .replace(/^import\s*\{([^}\n]+)\}\s*from\s*"([^"]+)";$/gm, (line, bindings, path) => {
            if (retained.has(path)) return line;
            if (path === "../store") return line.replace(path, "../store/menus/uiStore");
            if (path === "./preview") return line.replace(path, surface);
            return bindings.split(",").map(binding => {
              const name = binding.trim();
              return `const ${name} = ${stubs[name] ?? "() => null"};`;
            }).join("\n");
          });
      }
      if (id.endsWith("/FullCanvas.tsx")) {
        return source
          .replace('from "@react-three/fiber"', `from "${surface}"`)
          .replace('from "./performance/PerformanceProbe"', `from "${surface}"`)
          .replace('from "./game/stats/ScoreboardSceneCover"', `from "${surface}"`);
      }
    },
    resolveId(id) { if (id === surface) return surfaceId; },
    load(id) {
      if (id === surfaceId) return `
        import { createElement } from "react";
        export const Canvas = ({children, frameloop}) =>
          createElement("section", {"data-world-loop": frameloop}, children);
        export const useFrame = () => {}, useThree = () => {};
        export const HeroWorkshop = () => null, DrivingOverlay = () => null;
        export const ScoreboardSceneCover = () => null, PerformanceProbe = () => null;
        export const VehiclePreview = () => null;
      `;
    },
  };
}

function findElement(node, type) {
  if (!isValidElement(node)) return null;
  if (node.type === type) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}

test("Heroes, Main and Play hand off one startup garage; the live world owns a separate canvas", async () => {
  const dom = new JSDOM('<div id="startup-screen"><div data-live-garage data-garage-mounted="startup"><canvas></canvas></div></div><div id="root"></div>',
    { url: "http://localhost", pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.fromEntries(Object.keys(globals).map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

  let vite, root;
  try {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false },
      appType: "custom", logLevel: "error", plugins: [testSurfaces()] });
    const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
    await vite.ssrLoadModule("/src/game/GameUI.tsx");
    await vite.ssrLoadModule("/src/game/modes/WorldContents.tsx");
    const { useUIStore } = await vite.ssrLoadModule("/src/store/menus/uiStore.ts");
    const { VehiclePreview } = await vite.ssrLoadModule(surface);
    const { GarageMenuFurnishings } = await vite.ssrLoadModule("/src/game/preview/GarageMenuFurnishings.tsx");
    const runtime = globalThis.__avenskyGarage;
    runtime.owner = "startup"; // The standalone entry has already mounted its renderer.
    const room = document.querySelector("[data-live-garage]"), canvas = room.querySelector("canvas");
    const gameplay = () => document.querySelector("[data-world-loop]");
    const screen = next => act(async () => useUIStore.getState().setScreen(next));
    useUIStore.getState().setScreen("main");
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(createElement(App)));
    const home = document.querySelector(".garage-menu-backdrop");
    const inRoom = (parent, visible) => {
      assert.equal(document.querySelector("[data-live-garage]"), room);
      assert.equal(room.parentElement, parent);
      assert.equal(room.querySelector("canvas"), canvas);
      assert.equal(home.hidden, !visible);
    };
    const main = () => {
      inRoom(home, true);
      assert.equal(gameplay(), null);
      assert.equal(runtime.preview.demand, true);
      assert.ok(findElement(runtime.preview.contents, GarageMenuFurnishings));
    };
    const preview = id => {
      const slot = document.querySelector(".garage-preview-slot");
      assert.ok(slot);
      inRoom(slot, true);
      assert.equal(gameplay(), null);
      assert.equal(findElement(runtime.preview.contents, VehiclePreview)?.props.previewScreen, id);
      assert.equal(runtime.preview.demand, false, "desktop preview renders continuously");
    };

    main();
    await screen("heroes"); preview("heroes");
    await screen("main"); main();
    await screen("mode_select"); preview("mode_select");
    await screen("queue");
    inRoom(home, true);
    assert.equal(runtime.preview, null);
    assert.equal(gameplay(), null);

    await act(async () => useUIStore.getState().startModeLoading("sandbox"));
    inRoom(home, true);
    const world = gameplay();
    assert.equal(world.dataset.worldLoop, "always");
    assert.equal(world.parentElement.style.visibility, "hidden");
    await act(async () => useUIStore.getState().finishModeLoading());
    inRoom(home, false);
    assert.equal(gameplay(), world);
    assert.equal(world.parentElement.style.visibility, "");
    assert.ok(world.querySelector("[data-sandbox]"));
    assert.ok(world.querySelector("[data-gameplay-camera]"));
    await screen("main"); main();
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
