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
    if (delay !== 2350) return set(fn, delay, ...args);
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
    const { automaticGarageEmoteIds, rosterGarageEmotes } = await vite.ssrLoadModule("/src/game/characters/garageEmotes.ts");
    const { CHARACTER_PERSONALITIES } = await vite.ssrLoadModule("/src/game/characters/characterPersonality.ts");
    const { availableFinderEmotes } = await vite.ssrLoadModule("/src/game/characters/emoteFinder.ts");
    for (const carrying of [false, true]) {
      const available = new Set(availableFinderEmotes(carrying).map(item => item.id));
      const neutral = CHARACTER_PERSONALITIES.find(style => style.id === "neutral");
      assert.ok(neutral.emotes.every(id => automaticGarageEmoteIds(carrying).includes(id)), "the common gestures stay in every rotation");
      for (const style of CHARACTER_PERSONALITIES) {
        const pool = rosterGarageEmotes(style.id, carrying);
        const expected = new Set([...automaticGarageEmoteIds(carrying), ...style.emotes.filter(id => available.has(id))]);
        assert.deepEqual(new Set(pool.map(item => item.id)), expected, `complete ${style.label} rotation with bag=${carrying}`);
        assert.equal(pool.length, expected.size, "each emote occurs once per rotation");
      }
    }
    let personality = "playful", bag = false, creator;
    function Sample({ rig, paused }) { view = useRosterEmoteCycle(rig, paused, personality, bag, creator); return null; }
    const show = (paused = false) => act(async () => root.render(createElement(StrictMode, null, createElement(Sample, { rig, paused }))));
    const finish = () => { view.onSelectionEnd(); view.onSelectionEnd(); assert.equal(timers.size, 1); };
    const advance = async () => {
      const [id, fn] = timers.entries().next().value;
      timers.delete(id);
      await act(async () => fn());
    };

    await show();
    creator = "basic";
    await show();
    const breathing = view.emote;
    assert.equal(breathing.name, "Relaxed breathing");
    personality = "racer";
    await show();
    assert.equal(view.emote, breathing, "appearance steps ignore a previously saved personality");
    for (const id of ["002", "003", "001"]) {
      finish();
      await advance();
      assert.equal(view.emote.id, id, "appearance keeps the hands and props clear of the face");
    }
    const oldEnd = view.onSelectionEnd;
    finish();
    const oldRest = [...timers.values()][0];
    creator = "personality";
    await show();
    assert.equal(view.emote.id, "081");
    const previousSignatureEnd = view.onSelectionEnd;
    personality = "mechanic";
    await show();
    assert.equal(view.emote.id, "165", "previewing a personality replaces the previous cue immediately");
    oldEnd(); previousSignatureEnd(); oldRest();
    assert.equal(timers.size, 0, "interrupted previews cannot schedule a stale request");
    for (const id of ["164", "163", "161", "165"]) {
      finish();
      await advance();
      assert.equal(view.emote.id, id, "personality previews stay in the personality's own rotation");
    }
    finish();
    creator = "basic";
    await show();
    assert.equal(view.emote.id, "001", "returning to appearance restores the basic gestures");
    assert.equal(timers.size, 0);
    finish();
    await advance();
    const shift = view.emote;
    assert.equal(shift.id, "002");
    finish();
    personality = "neutral";
    creator = "personality";
    await show();
    assert.equal(timers.size, 0);
    assert.equal(view.emote.id, shift.id, "Neutral and the basic rotation both use the weight shift");
    assert.notEqual(view.emote, shift, "a matching gesture gets a fresh playback request");
    assert.equal(view.emote.keys, shift.keys, "both requests share their authored clip data");
    finish();
    await advance();
    assert.equal(view.emote.id, "035", "a previously resting pose continues into the new rotation");
    creator = undefined;
    personality = "playful";
    await show();
    const rotation = rosterGarageEmotes(personality, bag).map(emote => emote.id);
    assert.equal(view.emote.id, "021", "a playful character opens with their personality gesture");
    assert.equal(new Set(rotation).size, rotation.length);
    for (const id of [...automaticGarageEmoteIds(false), "023", "026", "robot-dance"]) assert(rotation.includes(id));
    assert.equal(timers.size, 0, "a slow-loading or still-playing rig can't skip ahead");
    for (const next of [...rotation.slice(1), rotation[0]]) {
      finish();
      await advance();
      assert.equal(view.emote.id, next);
      assert.equal(timers.size, 0, "no interval or polling during the next clip");
    }
    finish();
    personality = "scientist";
    await show();
    assert.equal(timers.size, 0, "changing personality cancels a previous rest");
    assert.equal(view.emote.id, "157", "the saved personality's own pool is selected");
    const scientist = rosterGarageEmotes(personality, false);
    assert(scientist.some(emote => emote.prop === "tablet"));
    bag = true;
    await show();
    const carrying = rosterGarageEmotes(personality, true).map(emote => emote.id);
    assert(automaticGarageEmoteIds(true).every(id => carrying.includes(id)));
    assert(carrying.includes("bag-lift") && carrying.includes("bag-check"));
    assert(!carrying.some(id => id.startsWith("stance-") || ["157", "158", "159", "160"].includes(id)),
      "the pack's prop and carrying rules determine which automatic gestures fit");
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
