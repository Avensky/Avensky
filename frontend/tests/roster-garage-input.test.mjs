import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from "three";
import { rosterCamera } from "../src/game/preview/rosterCamera.ts";
import { GarageCameraTravel } from "../src/game/preview/garageCameraTravel.ts";
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

test("Main retains the landscape orbit and frames the actor above phone menu actions", () => {
  const roster = rosterCamera(), main = rosterCamera("main");
  const a = new PerspectiveCamera(), b = new PerspectiveCamera();
  for (const [w, h] of [[844, 390], [1280, 720], [320, 568], [390, 844]]) {
    roster.frame(a, w, h);
    main.frame(b, w, h);
    for (const yaw of [-.24, .24]) for (const pitch of [-.09, .09]) {
      roster.orbit(a, yaw, pitch);
      main.orbit(b, yaw, pitch);
      b.updateMatrixWorld();
      if (w > h) {
        assert.ok(a.position.equals(b.position));
        assert.ok(a.quaternion.equals(b.quaternion));
        assert.ok(a.projectionMatrix.equals(b.projectionMatrix));
      } else {
        const y = height => (1 - new Vector3(0, height, 0).project(b).y) / 2;
        assert.ok(y(1.8) > .055 && y(0) < (h < 650 ? .49 : .61), "the shoes clear the progression line");
      }
    }
  }
});

test("Profile frames the fitted rig's eyes above the settings sheet and preserves the landscape shot", () => {
  // Heights from the shipped female and male rigs in metres including the eye and waist offsets.
  const rigs = [{ eyes: 1.569, waist: 1.095 }, { eyes: 1.711, waist: 1.164 }];
  for (const rig of rigs) {
    const profile = rosterCamera("profile"), roster = rosterCamera();
    const camera = new PerspectiveCamera(), original = new PerspectiveCamera();
    profile.frame(camera, 393, 852);
    profile.fitPortrait(rig.eyes, rig.waist); // Also works when geometry arrives after the camera.
    const y = height => (1 - new Vector3(0, height, 0).project(camera).y) / 2;
    for (const [width, height] of [[393, 852], [320, 568], [768, 1024], [844, 390], [1600, 900]]) {
      profile.frame(camera, width, height);
      roster.frame(original, width, height);
      for (const yaw of [-.24, .24]) for (const pitch of [-.09, .09]) {
        profile.orbit(camera, yaw, pitch);
        camera.updateMatrixWorld();
        if (width < height) {
          assert.ok(Math.abs(y(rig.eyes) - .16) < .000001);
          assert.ok(y(rig.waist) > .49 && y(rig.waist) < .55);
          assert.ok(y(rig.eyes + .125) > .055, "hair clears the top of the display");
        } else {
          roster.orbit(original, yaw, pitch);
          assert.ok(original.position.distanceTo(camera.position) < 1e-10);
          assert.ok(original.quaternion.angleTo(camera.quaternion) < 1e-6);
          assert.ok(original.projectionMatrix.equals(camera.projectionMatrix));
        }
      }
    }
  }
});

test("a delayed selected rig travels from the live dragged room using the same camera and lens", () => {
  for (const [width, height] of [[844, 390], [393, 852]]) {
    const camera = new PerspectiveCamera(), target = new PerspectiveCamera();
    const shot = rosterCamera(), travel = new GarageCameraTravel();
    const frame = (now, requested, yaw = .12) => travel.frame(camera, requested, width, height, 1, yaw, -.04, now, false);
    frame(0, undefined, 0);
    const initialOrientation = camera.quaternion.clone();
    frame(5000, shot);
    assert.equal(travel.phase, "waiting");
    assert.equal(travel.moving, false, "the model request does not start a render loop");
    assert.ok(camera.quaternion.angleTo(initialOrientation) > .1, "the room can still be dragged while loading");
    const source = camera.clone();
    shot.subject = "ready";
    frame(5016, shot);
    assert.equal(travel.phase, "framing");
    assert.ok(source.position.distanceTo(camera.position) < 1e-10);
    assert.ok(source.quaternion.angleTo(camera.quaternion) < 1e-6);
    assert.ok(source.projectionMatrix.equals(camera.projectionMatrix), "no off-centre lens or FOV jump on the first frame");
    shot.frame(target, width, height);
    shot.orbit(target, .12, -.04);
    const distance = target.position.distanceTo(source.position);
    frame(9016, shot); // The first dressed frame can take several seconds to compile.
    const progress = camera.position.distanceTo(source.position) / distance;
    assert.ok(progress > 0 && progress < .04, "a long cold frame cannot complete the trip");
    for (let i = 1; i <= 8; i++) frame(9016 + i * 50, shot);
    assert.ok(Math.abs(camera.position.distanceTo(source.position) / distance - .5) < 1e-7);
    assert.ok(Math.abs(camera.fov - (source.fov + target.fov) / 2) < 1e-8);
    assert.ok(Math.abs(camera.quaternion.angleTo(source.quaternion) - source.quaternion.angleTo(target.quaternion) / 2) < 1e-6);
    assert.ok(Math.abs(camera.projectionMatrix.elements[9] - target.projectionMatrix.elements[9] / 2) < 1e-7);
    for (let i = 9; i <= 18; i++) frame(9016 + i * 50, shot);
    assert.equal(travel.phase, "framed");
    assert.equal(travel.moving, false);
    assert.ok(camera.position.distanceTo(target.position) < 1e-10);
    assert.ok(camera.quaternion.angleTo(target.quaternion) < 1e-6);
    assert.ok(camera.projectionMatrix.equals(target.projectionMatrix));
  }
});

test("failed, interrupted, and reduced-motion handoffs release the camera", () => {
  const camera = new PerspectiveCamera(), travel = new GarageCameraTravel(), shot = rosterCamera();
  const frame = (now, requested, still = false) => travel.frame(camera, requested, 844, 390, 1, 0, 0, now, still);
  frame(0);
  const room = camera.position.clone();
  shot.subject = "unavailable";
  frame(15, shot);
  assert.equal(travel.phase, "framed");
  assert.equal(travel.moving, false);
  assert.ok(camera.position.equals(room), "a missing avatar leaves the room in its useful wide framing");
  shot.subject = "ready";
  frame(30, shot);
  frame(130, shot);
  const interrupted = camera.clone();
  travel.resume(); // Browser restored after being hidden.
  frame(100000, shot);
  assert.ok(camera.position.equals(interrupted.position));
  frame(100016, undefined);
  assert.equal(travel.phase, undefined);
  assert.ok(camera.position.distanceTo(interrupted.position) < 1e-10);
  assert.ok(camera.quaternion.angleTo(interrupted.quaternion) < 1e-6);
  for (let i = 1; i <= 10; i++) frame(100016 + i * 100, undefined);
  assert.equal(travel.moving, false);
  assert.ok(camera.position.equals(room));
  frame(101100, shot, true);
  assert.equal(travel.phase, "framed");
  assert.equal(travel.moving, false);
  assert.ok(camera.position.distanceTo(room) > 1, "reduced motion goes directly to the selected rig");
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
