import assert from "node:assert/strict";
import test from "node:test";
import { Group } from "three";
import { createServer } from "vite";

test("workshop authoring saves bounded pose tracks and resolves fitted chair targets", async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" });
  const load = path => vite.ssrLoadModule("/src/game/characters/" + path);
  const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const stored = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  } });
  try {
    const { CHARACTER_TABS } = await load("CharacterPage.tsx");
    assert.deepEqual(CHARACTER_TABS.map(item => item.id), ["details", "body", "appearance", "emotes"]);

    const { createdEmoteClip, defaultEmoteFrame, creatorTimeline, readCreatedEmotes, writeCreatedEmotes } = await load("emoteAuthoring.ts");
    const frames = [defaultEmoteFrame(), { ...defaultEmoteFrame("pose-greeting"), hold: .8, hands: "Open", facing: "Left" }];
    const draft = { id: "a".repeat(36), name: "Pit crew wave", frames };
    const { markers, duration } = creatorTimeline(frames);
    const clip = createdEmoteClip(draft);
    assert.ok(markers[1] > markers[0] + frames[0].hold);
    assert.equal(clip.duration, duration);
    assert.deepEqual(clip.keys[3][1].fingers, ["open", "open"]);
    assert.equal(clip.keys[3][1].turn, Math.PI / 4);
    assert.deepEqual(clip.keys.at(-1), [1, {}]);
    writeCreatedEmotes("one", [draft]);
    assert.deepEqual(readCreatedEmotes("one"), [draft]);
    assert.deepEqual(readCreatedEmotes("another"), []);
    assert.throws(() => writeCreatedEmotes("one", [{ ...draft, frames: [{ ...frames[0], hold: -10 }] }]));
    assert.deepEqual(readCreatedEmotes("one"), [draft]);

    const { chairSitClip, CHAIR_SEAT } = await load("garageInteractions.tsx");
    const stage = new Group();
    stage.position.set(1, .1, 3);
    stage.rotation.y = .7;
    const actor = new Group();
    stage.add(actor);
    for (const [side, x] of [["l", .08], ["r", -.08]]) {
      const hip = new Group();
      hip.name = "thigh_" + side;
      hip.position.set(x, .9, 0);
      actor.add(hip);
    }
    const seat = new Group();
    seat.name = CHAIR_SEAT;
    seat.position.set(.2, .47, -.3);
    seat.rotation.y = .25;
    stage.add(seat);
    const sit = chairSitClip(actor, seat);
    assert.ok(sit);
    const goal = sit.keys.at(-1)[1];
    assert.ok(Math.abs(goal.rise - (-.36)) < .0001);
    assert.ok(Math.abs(goal.sway - .2) < .0001);
    assert.ok(Math.abs(goal.travel - (-.3)) < .0001);
    assert.ok(Math.abs(goal.turn - .25) < .0001);
    seat.position.z = -3;
    assert.equal(chairSitClip(actor, seat), undefined);
    assert.equal(chairSitClip(actor, undefined), undefined);
  } finally {
    await vite.close();
    if (before) Object.defineProperty(globalThis, "localStorage", before);
    else delete globalThis.localStorage;
  }
});
