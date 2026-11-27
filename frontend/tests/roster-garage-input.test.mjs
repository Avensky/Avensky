import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from "three";
import { creatorStepFrames, rosterCamera } from "../src/game/preview/rosterCamera.ts";
import { garageMenuCamera } from "../src/game/preview/garageMenuCamera.ts";
import { GARAGE_BAY_DOORS } from "../src/game/preview/garageDoorLayout.ts";
import { GARAGE_MENU_LANDMARKS } from "../src/game/preview/garageMenuLandmarks.ts";
import { GARAGE_PARKING } from "../src/game/preview/garageServiceLayout.ts";
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

test("cosmetic and garage shader hooks share the actor dissolve without recompiling each frame", () => {
  const material = new MeshStandardMaterial(), actor = new Group();
  const facePigment = { value: .84 }, coverage = { value: 1 };
  material.onBeforeCompile = shader => { shader.uniforms.lipStrength = facePigment; };
  material.customProgramCacheKey = () => "face";
  const mesh = new Mesh(undefined, material);
  actor.add(mesh);
  prepareGaragePointLights(actor, "subject", coverage);
  const key = material.customProgramCacheKey();
  const shader = { uniforms: {}, fragmentShader: "#include <alphatest_fragment>\n#include <lights_fragment_maps>" };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.lipStrength, facePigment);
  assert.equal(shader.uniforms.rigCoverage, coverage);
  assert.match(shader.fragmentShader, /rigCoverage < 1.0/);
  coverage.value = .1;
  assert.equal(material.customProgramCacheKey(), key);
  assert.equal(material.transparent, false);
  material.dispose();
  mesh.geometry.dispose();
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

test("garage station shots keep the character in view across phone orientations", () => {
  const actor = new Vector3(0, .9, 0);
  const visible = (point, camera) => {
    const {x, y, z} = point.clone().project(camera);
    return Math.abs(x) < 1 && Math.abs(y) < 1 && Math.abs(z) < 1;
  };
  for (const [width, height] of [[844,390], [1280,720], [320,568], [390,844]]) {
    for (const [id, anchor] of Object.entries(GARAGE_MENU_LANDMARKS)) {
      const shot = garageMenuCamera(id), camera = new PerspectiveCamera();
      shot.frame(camera, width, height);
      for (const yaw of [-.24, 0, .24]) for (const pitch of [-.09, 0, .09]) {
        shot.orbit(camera, yaw, pitch);
        camera.updateMatrixWorld();
        assert.ok(visible(actor, camera), `${id} should keep the driver visible at ${width}×${height}`);
        if (!yaw && !pitch) {
          assert.ok(visible(new Vector3(...anchor), camera), `${id} should frame its station at ${width}×${height}`);
          if (id === "vehicle" && height > width) {
            const [x, , z] = GARAGE_PARKING.position;
            // A center pin can still be in view with both bumpers cropped off.
            for (const side of [-1, 1]) for (const end of [-1, 1]) for (const y of [0, 2]) {
              const corner = new Vector3(x + side * 2.41 / 2, y, z + end * 5.81 / 2);
              assert.ok(visible(corner, camera), "portrait fits the entire largest road pickup at rest");
            }
          }
          if (id === "enter_world" && width > height) {
            for (const { position } of GARAGE_BAY_DOORS) {
              const center = new Vector3(position[0], 1.45, position[2]);
              assert.ok(visible(center, camera), "the wide entry shot shows all three garage bays");
            }
          }
        }
      }
    }
  }
});

test("changing garage stations mid-travel picks up from the displayed camera and settles", () => {
  const travel = new GarageCameraTravel(), camera = new PerspectiveCamera();
  const frame = (time, shot, reduced = false) => travel.frame(camera, shot, 844, 390, 1, 0, 0, time, reduced);
  const entrance = garageMenuCamera("enter_world");
  const vehicle = garageMenuCamera("vehicle");
  const editor = garageMenuCamera("world_editor");
  frame(0, entrance, true);
  frame(16, vehicle);
  frame(100, vehicle);
  const displayed = camera.clone();
  frame(116, editor);
  assert.equal(travel.moving, true);
  assert.ok(camera.position.distanceTo(displayed.position) < 1e-9);
  assert.ok(camera.quaternion.angleTo(displayed.quaternion) < 1e-6);
  assert.ok(camera.projectionMatrix.equals(displayed.projectionMatrix));
  for (let time = 132; time < 1800; time += 16) frame(time, editor);
  const destination = new PerspectiveCamera();
  editor.frame(destination, 844, 390);
  assert.ok(camera.position.distanceTo(destination.position) < 1e-9);
  assert.equal(travel.moving, false, "the renderer can sleep at a settled station");
  frame(1800, vehicle, true);
  vehicle.frame(destination, 844, 390);
  assert.ok(camera.position.distanceTo(destination.position) < 1e-9);
  assert.equal(travel.moving, false, "reduced motion applies the selected shot immediately");
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

test("creator frames both rigs above the controls and can reverse an unfinished close-up", () => {
  for (const [width, height] of [[1280, 720], [844, 390], [393, 852], [320, 568]]) {
    const portrait = width < height;
    for (const [eyes, waist] of [[1.569, 1.095], [1.711, 1.164]]) {
      const camera = new PerspectiveCamera(), travel = new GarageCameraTravel();
      const [body, face, outfit] = ["body", "face", "outfit"].map(framing => {
        const shot = rosterCamera("create", framing);
        shot.fitPortrait(eyes, waist);
        shot.subject = "ready";
        return shot;
      });
      const frame = (time, shot, reduced = false) => travel.frame(camera, shot, width, height, 1, .12, -.03, time, reduced);
      const screenY = y => (1 - new Vector3(0, y, 0).project(camera).y) / 2;
      frame(0, body, true);
      const start = camera.clone();
      frame(10, face);
      assert.equal(travel.phase, "framing");
      assert.ok(start.position.distanceTo(camera.position) < 1e-10 && start.projectionMatrix.equals(camera.projectionMatrix));
      for (let t = 60; t <= 360; t += 50) frame(t, face);
      const halfway = camera.clone();
      assert.ok(start.position.distanceTo(halfway.position) > .05);
      frame(370, outfit);
      assert.ok(halfway.position.distanceTo(camera.position) < 1e-10);
      assert.ok(halfway.quaternion.angleTo(camera.quaternion) < 1e-6 && halfway.projectionMatrix.equals(camera.projectionMatrix));
      for (let t = 470; t <= 1370; t += 100) frame(t, outfit);
      camera.updateMatrixWorld();
      assert.equal(travel.moving, false);
      assert.ok(screenY(eyes + .125) > .055, "the hairstyle clears the header");
      assert.ok(portrait ? screenY(waist) < .49 : screenY(0) < .98, "the upper outfit is visible above the portrait controls and the full outfit fits in landscape");
      const outfitSize = screenY(waist) - screenY(eyes);
      frame(1380, face, true);
      camera.updateMatrixWorld();
      assert.equal(travel.phase, "framed");
      assert.equal(travel.moving, false);
      assert.ok(screenY(eyes + .125) > .055);
      assert.ok(screenY(eyes) > .22 && screenY(eyes) < .45);
      assert.ok(screenY(waist) - screenY(eyes) > outfitSize * 1.7, "makeup and colors use a visibly closer face shot");
    }
  }
});

test("Looks holds the whole face, Eyes enlarges the irises, and Makeup keeps the mouth visible on both rigs", () => {
  const rigs = [{ y: 1.5583, z: .0895, waist: 1.095, lip: 1.501, radius: .006 },
    { y: 1.7219, z: .1105, waist: 1.164, lip: 1.648, radius: .0066 }];
  for (const rig of rigs) for (const [w, h] of [[1280, 720], [844, 390], [393, 852], [320, 568]]) {
    const portrait = w < h;
    // The midpoint is on the face, in front of the actor's pivot.
    const eyes = new Vector3(Math.sin(.68) * rig.z, rig.y, Math.cos(.68) * rig.z);
    const camera = new PerspectiveCamera(), travel = new GarageCameraTravel();
    const frames = Object.fromEntries(["looks", "makeup", "eyes"].map(step => {
      const shot = rosterCamera("create", creatorStepFrames[step]);
      shot.fitPortrait(eyes.y, rig.waist, eyes.x, eyes.z);
      shot.subject = "ready";
      return [step, shot];
    }));
    const sizes = {};
    let now = 0;
    const draw = (step, delta, reduced = false) => {
      travel.frame(camera, frames[step], w, h, 1, .08, -.025, now += delta, reduced);
      camera.updateMatrixWorld();
    };
    for (const step of ["looks", "makeup", "eyes"]) {
      draw(step, 16, true);
      assert.equal(travel.phase, "framed");
      const pixelY = y => (1 - new Vector3(eyes.x, y, eyes.z).project(camera).y) * h / 2;
      const eyePixel = eyes.clone().project(camera);
      assert.ok(Math.abs((1 + eyePixel.x) / 2 - (portrait ? .5 : .3)) < 1e-6, "iris midpoint stays in the free column");
      const line = pixelY(rig.y) / h;
      assert.ok(line > .24 && line < .50, "eyes are clear of the top header and palette");
      sizes[step] = pixelY(rig.y - rig.radius) - pixelY(rig.y + rig.radius);
      if (step === "looks") assert.ok(pixelY(rig.y + .12) / h >= .06, "full head fits above the Looks picker");
      if (step === "makeup") assert.ok(pixelY(rig.lip) / h < (portrait ? .58 : .69), "lips remain inside the preview");
    }
    assert.ok(sizes.makeup > sizes.looks * 1.4);
    assert.ok(sizes.eyes > sizes.makeup * 1.35);
    assert.ok(sizes.eyes > sizes.looks * 2);
    function switchWithoutCut(next) {
      const before = camera.clone();
      draw(next, 16);
      assert.equal(travel.phase, "framing");
      assert.ok(before.position.distanceTo(camera.position) < 1e-10);
      assert.ok(before.quaternion.angleTo(camera.quaternion) < 1e-6);
      assert.ok(before.projectionMatrix.equals(camera.projectionMatrix));
    }
    for (const next of ["looks", "eyes", "makeup", "looks"]) {
      switchWithoutCut(next);
      draw(next, 2400);
      assert.ok(travel.moving, "an upload stall cannot skip the lens travel");
      for (let i = 0; i < 4; i++) draw(next, 50);
    }
    for (let i = 0; i < 16; i++) draw("looks", 50);
    assert.equal(travel.phase, "framed");
  }
});

test("late rig landmarks ease from the settled camera without moving the first displayed frame", () => {
  const shot = rosterCamera("create", "face"), camera = new PerspectiveCamera();
  const travel = new GarageCameraTravel();
  shot.subject = "ready";
  const frame = (now, reduced = false) => travel.frame(camera, shot, 400, 800, 1, .08, 0, now, reduced);
  frame(0, true);
  const before = camera.clone();
  shot.fitPortrait(1.711, 1.164);
  frame(80);
  assert.equal(travel.phase, "framing");
  assert.ok(before.position.equals(camera.position));
  assert.ok(before.projectionMatrix.equals(camera.projectionMatrix));
  for (let t = 180; t <= 1080; t += 100) frame(t);
  assert.equal(travel.phase, "framed");
  assert.ok(before.position.distanceTo(camera.position) > .1);
  shot.fitPortrait(1.711, 1.164);
  frame(1100);
  assert.equal(travel.phase, "framed", "sampling identical anchors cannot restart travel");
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
