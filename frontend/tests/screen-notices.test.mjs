import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test("screen notices replace a source, expire independently, and release a closed screen", async t => {
  const dom = new JSDOM('<main id="root"></main>', { url: "http://localhost/" });
  const original = new Map();
  for (const [key, value] of Object.entries({ document: dom.window.document, window: dom.window, IS_REACT_ACT_ENVIRONMENT: true })) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  let vite, root, act;
  try {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" });
    const { createScreenNotice, SCREEN_NOTICE_MS, useScreenNotice } = await vite.ssrLoadModule("/src/components/menus/ScreenNotice.tsx");
    const { createElement, act: reactAct } = await import("react");
    const { createRoot } = await import("react-dom/client");
    act = reactAct;
    let publish;
    function Editor() { publish = useScreenNotice(); return createElement("input"); }
    root = createRoot(document.querySelector("main"));
    await act(async () => root.render(createElement(Editor)));
    const input = document.querySelector("input");
    input.focus();
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const texts = () => Array.from(document.querySelectorAll(".screen-notices [role=status]"), item => item.textContent);
    const fades = [];
    dom.window.Element.prototype.animate = function (frames, timing) {
      const animation = { node: this, frames, timing, cancel: t.mock.fn() };
      fades.push(animation);
      return animation;
    };
    const entry = createScreenNotice();
    publish("Saving…");
    document.documentElement.dataset.reduceMotion = "true";
    entry.show("Ava", "status", "Fitting room");
    const [saving, arrival] = fades;
    assert.deepEqual(saving.frames, [{ opacity: 1 }, { opacity: 0 }]);
    assert.equal(saving.timing.duration + saving.timing.delay, SCREEN_NOTICE_MS);
    assert.equal(saving.timing.fill, "forwards");
    assert.ok(Number.isFinite(saving.startTime));
    assert.equal(arrival.timing.easing, "steps(1, end)");
    assert.equal(document.querySelector(".screen-notice > small").textContent, "Fitting room");
    assert.deepEqual(texts(), ["Saving…", "Fitting room Ava"]);
    t.mock.timers.tick(SCREEN_NOTICE_MS - 100);
    publish("Saved");
    assert.equal(saving.cancel.mock.callCount(), 1);
    assert.equal(fades[2].node, saving.node, "renew the visual deadline on the same live-region node");
    assert.equal(arrival.cancel.mock.callCount(), 0, "renewing a save preserves the arrival deadline");
    assert.deepEqual(texts(), ["Saved", "Fitting room Ava"]);
    t.mock.timers.tick(100);
    assert.equal(arrival.cancel.mock.callCount(), 1);
    assert.equal(fades[2].cancel.mock.callCount(), 0);
    assert.deepEqual(texts(), ["Saved"]);
    assert.equal(document.activeElement, input);
    assert.equal(document.querySelector("main .screen-notice"), null);
    t.mock.timers.tick(SCREEN_NOTICE_MS - 200);
    publish("Saved");
    t.mock.timers.tick(200);
    assert.deepEqual(texts(), ["Saved"]);
    t.mock.timers.tick(SCREEN_NOTICE_MS);
    assert.equal(document.querySelector(".screen-notices"), null);
    delete dom.window.Element.prototype.animate;
    publish("<b>New result</b>", "alert", "<b>Update</b>");
    assert.equal(document.querySelector(".screen-notice").getAttribute("role"), "alert");
    assert.equal(document.querySelector(".screen-notices b"), null);
    await act(async () => root.render(null));
    publish("Late result");
    assert.deepEqual(texts(), []);
  } finally {
    t.mock.timers.reset();
    if (root) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, previous] of original) {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    }
  }
});
