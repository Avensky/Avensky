import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createServer } from "vite";

test("game buttons activate once per touch or pen tap and still accept keyboard and assistive clicks", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const { window } = dom;
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let vite, root;
  try {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" });
    const { GameButton } = await vite.ssrLoadModule("/src/components/GameButton.tsx");
    const { createRoot } = await import("react-dom/client");
    root = createRoot(document.getElementById("root"));
    const activations = [];
    await act(async () => root.render(createElement(GameButton, { onPress: event => activations.push(event.type) }, "Preview")));
    const button = document.querySelector('[role="button"]');
    for (const pointerType of ["touch", "pen", "mouse"]) {
      for (const type of ["pointerdown", "pointerup", "click"])
        button.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerType, button: 0, detail: 0 }));
      assert.deepEqual(activations.splice(0), ["pointerup"], pointerType);
    }
    button.click();
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, detail: 0 }));
    button.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" }));
    assert.deepEqual(activations, ["click", "click", "keydown"]);
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
