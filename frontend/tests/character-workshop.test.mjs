import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
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

    const { createVehiclePartRig } = await vite.ssrLoadModule("/src/game/preview/vehiclePartRig.ts");
    const { preparePanelOpening } = await load("garageInteractions.tsx");
    const car = new Group();
    const mesh = (name, dimensions, position) => {
      const part = new Mesh(new BoxGeometry(...dimensions));
      part.name = name;
      part.position.set(...position);
      car.add(part);
      return part;
    };
    mesh("BODY", [1.8, 1, 4.4], [0, .5, 0]);
    mesh("HEADLIGHT_LEFT_LENS_COVER", [.4, .15, .3], [-.6, .6, -1.8]);
    mesh("HOOD", [1.4, .19, 1.1], [0, .72, -1.47]);
    const vent = mesh("HOOD_VENT_FRAME", [.8, .06, .3], [0, .78, -1.47]);
    const latch = mesh("HOOD_LATCH_LOCK", [.22, .04, .05], [0, .6, -1.85]);
    const trunk = mesh("TRUNK", [1.3, .16, .6], [0, .8, 1.85]);
    const right = mesh("Mesh155_body_0", [.13, .65, 1.4], [.82, .5, -.07]);
    const glass = mesh("WINDOW_RIGHT_TINT", [.04, .35, .95], [.78, 1, 0]);
    const rigs = createVehiclePartRig(car, "brz");
    const hood = rigs.find(hinge => hinge.part === "hood");
    const boot = rigs.find(hinge => hinge.part === "trunk");
    const door = rigs.find(hinge => hinge.part === "door-right");
    assert.equal(vent.parent, hood.pivot);
    assert.equal(latch.parent, hood.latch);
    assert.equal(trunk.parent, boot.pivot);
    assert.equal(right.parent, door.pivot);
    assert.equal(glass.parent, door.pivot);
    assert.ok(hood.stance.point.z < -2.2 && boot.stance.point.z > 2.2, "approach points clear the vehicle bounds");
    for (const hinge of [hood, boot]) {
      const height = hinge.handle.getWorldPosition(new Vector3()).y;
      hinge.pivot.rotation[hinge.axis] = hinge.open;
      assert.ok(hinge.handle.getWorldPosition(new Vector3()).y > height + .15);
      hinge.pivot.rotation[hinge.axis] = hinge.closed;
    }
    const arm = new Group(), elbow = new Group(), hand = new Group();
    arm.name = "upperarm_r"; elbow.name = "lowerarm_r"; hand.name = "hand_r";
    arm.position.set(.14, 1.2, -2.5); elbow.position.y = -.38; hand.position.y = -.32;
    actor.add(arm); arm.add(elbow); elbow.add(hand);
    const opening = preparePanelOpening(actor, hood);
    opening.sample(.45);
    assert.equal(hood.angle, 0, "release the latch before lifting the hood");
    assert.notEqual(hood.latch.rotation[hood.axis], 0);
    opening.sample(1.8);
    assert.equal(hood.angle, hood.open);
    opening.stop();
    assert.equal(hood.latch.rotation[hood.axis], 0);

    const { brzWalkRoute, crossesBrzHull } = await vite.ssrLoadModule("/src/game/preview/brzApproach.ts");
    const envelope = new Box3(new Vector3(-1.3, 0, -2.5), new Vector3(1.3, 1.2, 2.5));
    const from = new Vector3(1.5, 0, 0), to = new Vector3(-1.5, 0, 0);
    assert.equal(crossesBrzHull(from, to, envelope), true);
    const route = brzWalkRoute(from, to, envelope);
    assert.ok(route.length >= 4, "crossing to the other door must go around the body");
    for (let i = 1; i < route.length; i++) assert.equal(crossesBrzHull(route[i-1], route[i], envelope), false);
    assert.equal(brzWalkRoute(from, new Vector3(0, 0, 0), envelope), undefined, "reject a stopping point inside the vehicle");

    const { scene: rig } = await new GLTFLoader().parseAsync(await readFile("tests/fixtures/villager-female-rig.json", "utf8"), "");
    const standing = new Group();
    standing.position.set(1.30, .07, -.26);
    standing.rotation.y = -Math.PI / 2;
    standing.add(rig);
    const gripPivot = new Group(), driverGrip = new Group();
    driverGrip.position.set(.889, .656, -.42);
    gripPivot.add(driverGrip);
    const lowReach = preparePanelOpening(rig, { part: "door-left", pivot: gripPivot, axis: "y", closed: 0, open: 1,
      handle: driverGrip, angle: 0 }, false, true, normal => normal.set(1, 0, 0));
    lowReach.sample(.44);
    for (const side of ["l", "r"]) {
      assert.ok(rig.getObjectByName(`calf_${side}`).getWorldPosition(new Vector3()).x > 1.04,
        `the ${side} knee stays outside the sill during the low reach`);
    }
    lowReach.stop();

    const { BRZ_HOOD_SECONDS, CLOSE_BRZ_HOOD, sampleBrzHood } = await load("brzHoodMotion.ts");
    const { garagePanelForEmote } = await load("garageInteractions.tsx");
    assert.equal(garagePanelForEmote(CLOSE_BRZ_HOOD), "hood");
    assert.equal(sampleBrzHood(.56).hood, 0, "reach the safety catch before lifting");
    assert.ok(sampleBrzHood(.56).catch > 0);
    assert.equal(sampleBrzHood(1.5).rightGrip, 0, "the left hand lifts the hood");
    const readyToBrace = sampleBrzHood(2.38);
    assert.equal(readyToBrace.hood, 1);
    assert.equal(readyToBrace.leftGrip, 1);
    assert.equal(readyToBrace.rightGrip, 1);
    assert.equal(readyToBrace.prop, 0);
    assert.equal(sampleBrzHood(BRZ_HOOD_SECONDS).prop, 1);
    let prior = sampleBrzHood(0, true);
    for (let t = .025; t < BRZ_HOOD_SECONDS; t += .025) {
      const closing = sampleBrzHood(t, true);
      if (closing.hood < prior.hood) assert.equal(closing.prop, 0, "stow the prop before lowering the lid");
      prior = closing;
    }
    assert.equal(sampleBrzHood(BRZ_HOOD_SECONDS, true).hood, 0);

    const { prepareBrzGait } = await vite.ssrLoadModule("/src/game/preview/brzGait.ts");
    const ground = new Group();
    standing.position.set(0, .023, 0);
    standing.rotation.y = 0;
    ground.add(standing);
    const shoe = rig.getObjectByName("foot_r");
    const stance = shoe.getWorldPosition(new Vector3());
    const gait = prepareBrzGait(rig, ground, 2, (distance, at, direction) => {
      at.set(0, .023, distance);
      direction.set(0, 0, 1);
    }, new Vector3(0, 0, 1));
    for (const distance of [.08, .16, .22]) {
      standing.position.z = distance;
      gait.sample(distance);
      const drift = shoe.getWorldPosition(new Vector3()).distanceTo(stance);
      assert.ok(drift < .015, `the stance shoe drifted ${drift.toFixed(4)} m at ${distance} m`);
    }
    gait.stop();

    const { prepareBrzCabin, validBrzCabinColors } = await vite.ssrLoadModule("/src/game/preview/brzCabin.ts");
    const shared = new MeshStandardMaterial({ color: "#6c0e24" });
    const leftSeat = mesh("Mesh132_red1_0", [1, 1, 1], [0, 1, 0]);
    const rightSeat = mesh("Mesh134_red1_0", [1, 1, 1], [1, 1, 0]);
    const fixed = mesh("DASH_TRIM", [1, 1, 1], [0, 1, 1]);
    leftSeat.material = rightSeat.material = fixed.material = shared;
    const cabin = prepareBrzCabin(car);
    assert.deepEqual(leftSeat.userData.brzPart, { id: "seat-fabric", label: "Seat upholstery", side: "left", sourceName: "Mesh132_red1_0" });
    assert.deepEqual(validBrzCabinColors({ "seat-fabric": "#22bb66", "seat-shell": "red", dashboard: "#ffffff" }), { "seat-fabric": "#22bb66" });
    cabin.apply({ "seat-fabric": "#22bb66" }, "factory");
    assert.equal(leftSeat.material.color.getHex(), 0x22bb66);
    assert.equal(rightSeat.material.color.getHex(), 0x22bb66);
    assert.equal(fixed.material.color.getHex(), 0x6c0e24);
    cabin.apply({}, "factory");
    assert.equal(leftSeat.material.color.getHex(), 0x6c0e24);
    cabin.dispose();
  } finally {
    await vite.close();
    if (before) Object.defineProperty(globalThis, "localStorage", before);
    else delete globalThis.localStorage;
  }
});
