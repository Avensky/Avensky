import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

test("only completed roster emotes queue the next visible rig's emote", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.test", pretendToBeVisual: true });
  const { window } = dom;
  const previous = new Map();
  for (const [key, value] of Object.entries({ window, document: window.document, localStorage: window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const media = Object.assign(new window.EventTarget(), { matches: false });
  window.matchMedia = () => media;
  const timers = new Map();
  let serial = 0, view, rig = { uuid: "first" };
  const set = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
  window.setTimeout = (fn, delay, ...args) => {
    if (delay !== 4000) return set(fn, delay, ...args);
    timers.set(--serial, fn);
    return serial;
  };
  window.clearTimeout = id => { if (!timers.delete(id)) clear(id); };
  const root = createRoot(document.getElementById("root"));
  let vite, unmounted = false;
  try {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" });
    const { useRosterEmoteCycle } = await vite.ssrLoadModule("/src/game/preview/useRosterEmoteCycle.ts");
    const { usePreferencesStore } = await vite.ssrLoadModule("/src/store/preferences/preferencesStore.ts");
    function Sample({ rig, paused }) { view = useRosterEmoteCycle(rig, paused); return null; }
    const show = (paused = false) => act(async () => root.render(createElement(StrictMode, null, createElement(Sample, { rig, paused }))));
    const finish = () => { view.onSelectionEnd(); view.onSelectionEnd(); assert.equal(timers.size, 1); };
    const advance = async () => {
      const [id, fn] = timers.entries().next().value;
      timers.delete(id);
      await act(async () => fn());
    };

    await show();
    assert.equal(view.pose, "pose-pocket-stance");
    assert.equal(timers.size, 0, "a slow-loading or still-playing rig can't skip ahead");
    for (const next of ["pose-hand-on-hip", "pose-crossed-ankles", "pose-pocket-stance"]) {
      finish();
      await advance();
      assert.equal(view.pose, next);
      assert.equal(timers.size, 0, "no interval or polling during the next clip");
    }
    finish();
    rig = { uuid: "second" };
    await show();
    assert.equal(timers.size, 0, "the old character cannot advance the new one");
    finish();
    await show(true);
    assert.equal(view.paused, true);
    assert.equal(timers.size, 0);
    await show();
    finish();
    await act(async () => { media.matches = true; media.dispatchEvent(new window.Event("change")); });
    assert.equal(view.paused, true);
    view.onSelectionEnd();
    assert.equal(timers.size, 0);
    await act(async () => { media.matches = false; media.dispatchEvent(new window.Event("change")); });
    finish();
    await act(async () => usePreferencesStore.setState({ reducedMotion: true }));
    assert.equal(view.paused, true);
    assert.equal(timers.size, 0);
    await act(async () => usePreferencesStore.setState({ reducedMotion: false }));
    finish();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await act(async () => document.dispatchEvent(new window.Event("visibilitychange")));
    assert.equal(view.paused, true);
    assert.equal(timers.size, 0);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => document.dispatchEvent(new window.Event("visibilitychange")));
    finish();
    await act(async () => root.unmount());
    unmounted = true;
    assert.equal(timers.size, 0);
  } finally {
    if (!unmounted) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
