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
    const roster = createScreenNotice();
    publish("Saving…");
    roster.show("Invite sent");
    assert.deepEqual(texts(), ["Saving…", "Invite sent"]);
    t.mock.timers.tick(SCREEN_NOTICE_MS - 100);
    publish("Saved");
    assert.deepEqual(texts(), ["Saved", "Invite sent"]);
    t.mock.timers.tick(100);
    assert.deepEqual(texts(), ["Saved"]);
    assert.equal(document.activeElement, input);
    assert.equal(document.querySelector("main .screen-notice"), null);
    t.mock.timers.tick(SCREEN_NOTICE_MS - 200);
    publish("Saved");
    t.mock.timers.tick(200);
    assert.deepEqual(texts(), ["Saved"]);
    t.mock.timers.tick(SCREEN_NOTICE_MS);
    assert.equal(document.querySelector(".screen-notices"), null);
    publish("<b>New result</b>", "alert");
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
