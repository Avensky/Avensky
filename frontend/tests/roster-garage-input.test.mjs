import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from "three";
import { rosterCamera } from "../src/game/preview/rosterCamera.ts";
import { installGarageEntryInteraction } from "../src/game/preview/garageEntryInteraction.ts";
import { bindRosterSticks, readRosterSticks, releaseRosterSticks } from "../src/game/preview/rosterStickControls.ts";
import { prepareGaragePointLights } from "../src/game/preview/garagePointLights.ts";

test("character fill is applied once to saved wardrobe materials using the existing garage probe", () => {
  for (const subject of [false, true]) {
    const group = new Group(), material = new MeshStandardMaterial(), mesh = new Mesh(undefined, material);
    group.add(mesh);
    mesh.visible = !subject; // A saved look may reveal an initially hidden garment.
    const mode = subject ? "subject" : "room";
    prepareGaragePointLights(group, mode);
    const hook = material.onBeforeCompile;
    prepareGaragePointLights(group, mode);
    assert.equal(material.onBeforeCompile, hook);
    const shader = { fragmentShader: "#include <lights_fragment_begin>\n#include <lights_fragment_maps>" };
    hook.call(material, shader);
    assert.match(shader.fragmentShader, /lamp\.distance/);
    assert.equal(shader.fragmentShader.includes("iblIrradiance *="), subject);
    assert.equal(group.children.length, 1);
    material.dispose();
    mesh.geometry.dispose();
  }
});

test("both rigs fit the selector framing across orientation and garage orbit", () => {
  for (const [width, height] of [[1280, 720], [844, 390], [390, 844], [768, 1024]]) {
    const camera = new PerspectiveCamera(), shot = rosterCamera();
    shot.frame(camera, width, height);
    const portrait = height > width;
    const screen = y => {
      const v = new Vector3(0, y, 0).project(camera);
      return [(v.x + 1) / 2, (1 - v.y) / 2];
    };
    for (const yaw of [-.24, 0, .24]) for (const pitch of [-.09, 0, .09]) {
      shot.orbit(camera, yaw, pitch);
      camera.updateMatrixWorld();
      const [x, y] = screen(.87);
      assert.ok(Math.abs(x - (portrait ? .50 : .30)) < 1e-6);
      assert.ok(Math.abs(y - (portrait ? .40 : .53)) < 1e-6);
      assert.ok(screen(1.8)[1] > .075);
      assert.ok(screen(0)[1] < (portrait ? .70 : .93));
      if (portrait) assert.ok(screen(0)[1] - screen(1.74)[1] >= .57);
    }
  }
});

test("only the initial hit chooses the actor and UI presses are ignored", () => {
  const dom = new JSDOM('<div class="garage-orbit-surface"></div><div role="button">Play</div>');
  const { window } = dom;
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;
  const surface = document.querySelector(".garage-orbit-surface");
  const root = document.documentElement;
  root.dataset.garageReady = "true";
  root.setPointerCapture = root.releasePointerCapture = () => {};
  root.hasPointerCapture = () => true;
  const pointer = (type, x, target = surface) => target.dispatchEvent(new window.PointerEvent(type, {
    pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: x, bubbles: true, cancelable: true,
  }));
  let hitCount = 0, turn = 0;
  const actor = { hit: x => { hitCount++; return x < 100; }, turn: angle => { turn += angle; } };
  const motion = { yaw: 0, pitch: 0, dragging: false };
  const controls = installGarageEntryInteraction(motion, () => false, () => actor);
  try {
    pointer("pointerdown", 90);
    pointer("pointermove", 150);
    pointer("pointermove", 190);
    assert.equal(hitCount, 1);
    assert.ok(Math.abs(turn - .8) < 1e-10);
    assert.equal(motion.dragging, false);
    pointer("pointerup", 190);
    pointer("pointerdown", 120);
    pointer("pointermove", 80);
    assert.equal(hitCount, 2);
    assert.ok(motion.targetYaw < 0);
    assert.ok(Math.abs(turn - .8) < 1e-10);
    pointer("pointercancel", 80);
    assert.equal(motion.dragging, false);
    pointer("pointerdown", 50, document.querySelector('[role="button"]'));
    assert.equal(hitCount, 2);
  } finally {
    controls.abort();
    dom.window.close();
    Object.assign(globalThis, previous);
  }
});

test("controller rotation is independent of poll frequency and inactive scenes release the sticks", () => {
  for (const hz of [30, 60, 120]) {
    let radians = 0;
    const calls = [];
    const unbind = bindRosterSticks((x, y, t, dt) => { radians += t * dt; calls.push([x, y]); });
    for (let frame = 0; frame <= hz; frame++) assert.equal(readRosterSticks(.6, -.2, .75, 500 + 1000 * frame / hz), true);
    assert.ok(Math.abs(radians - .75) < 1e-10);
    assert.deepEqual(calls.at(-1), [.6, -.2]);
    releaseRosterSticks();
    assert.deepEqual(calls.at(-1), [0, 0]);
    unbind();
    assert.equal(readRosterSticks(1, 1, 1, 5000), false);
  }
});
