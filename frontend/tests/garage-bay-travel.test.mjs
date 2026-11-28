import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { copyGarageView, showroomZoom } from "../src/game/preview/workshopFraming.ts";
import { GarageCameraTravel } from "../src/game/preview/garageCameraTravel.ts";
import { garageMenuCamera } from "../src/game/preview/garageMenuCamera.ts";
import { rosterCamera } from "../src/game/preview/rosterCamera.ts";

test("the bay-wall camera keeps the driver in frame during the turn in both directions", () => {
  for (const [width, height] of [[844, 390], [375, 812], [320, 568], [1280, 720]]) {
    for (const station of ["roster", "wardrobe", "vehicle", "world_editor"]) {
      const other = station === "roster" ? rosterCamera() : garageMenuCamera(station);
      other.subject = "ready";
      const entry = garageMenuCamera("enter_world");
      for (const [source, target] of [[other, entry], [entry, other]]) {
        for (const yaw of [-.24, 0, .24]) for (const pitch of [-.09, 0, .09]) {
          const travel = new GarageCameraTravel(), camera = new PerspectiveCamera();
          const frame = (shot, time, immediate = false) =>
            travel.frame(camera, shot, width, height, 1, yaw, pitch, time, immediate);
          frame(source, 0, true);
          const start = camera.position.clone();
          frame(target, 10);
          assert.ok(start.distanceTo(camera.position) < 1e-8);
          for (let ms = 35; ms <= 1010; ms += 25) {
            frame(target, ms);
            camera.updateMatrixWorld();
            for (const y of [0, 1.74]) {
              const point = new Vector3(0, y, 0).project(camera);
              assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1,
                `${station} ${width}x${height} at ${ms} ms`);
            }
          }
          assert.equal(travel.moving, false);
        }
      }
    }
  }
});

test("returning to the same garage station starts from the displayed inspection angle and zoom", () => {
  const travel = new GarageCameraTravel();
  const room = new PerspectiveCamera(), inspector = new PerspectiveCamera(60);
  const shot = garageMenuCamera("wardrobe");
  const frame = (time, immediate) => travel.frame(room, shot, 844, 390, 1, 0, 0, time, immediate);
  frame(0, true);
  const destination = room.position.clone();
  inspector.position.set(.4, 1.6, 2.4);
  inspector.lookAt(0, 1.45, 0);
  inspector.zoom = 1.3;
  inspector.setViewOffset(844, 390, 160, -12, 844, 390);
  copyGarageView(inspector, room);
  room.userData.returnedFromWorkshop = true;
  frame(100);
  assert.ok(room.position.distanceTo(inspector.position) < 1e-8);
  assert.ok(room.quaternion.angleTo(inspector.quaternion) < 1e-6);
  assert.ok(Math.abs(room.fov - inspector.getEffectiveFOV()) < 1e-8);
  assert.equal(room.view.offsetX, 160);
  assert.equal(room.view.offsetY, -12);
  for (let time = 150; time <= 600; time += 50) frame(time);
  assert.ok(room.position.distanceTo(destination) > .1 && room.position.distanceTo(inspector.position) > .1);
  for (let time = 650; time <= 1100; time += 50) frame(time);
  assert.ok(room.position.distanceTo(destination) < 1e-8);
  assert.equal(travel.moving, false);
});

test("the rotating showroom car fits the actual open rectangle in portrait and landscape", () => {
  for (const [width, height, left, top, openWidth, openHeight] of [
    [375, 812, 6, 54, 361, 313], [844, 390, 15, 40, 454, 308], [1280, 720, 18, 52, 690, 560],
  ]) {
    const camera = new PerspectiveCamera(width < height ? 75 : 42, width / height);
    const target = new Vector3(0, .84, 0);
    camera.position.set(2.8, 2.5, 5.8);
    camera.lookAt(target);
    const distance = camera.position.distanceTo(target);
    const x = 1.2, y = .84, z = 2.65;
    const elevation = Math.asin((camera.position.y - target.y) / distance);
    camera.zoom = Math.min(1, showroomZoom({radius:Math.hypot(x,z), halfHeight:y}, distance, elevation,
      camera.fov, height, openWidth, openHeight));
    camera.setViewOffset(width, height, width / 2 - (left + openWidth / 2),
      height / 2 - (top + openHeight / 2), width, height);
    camera.updateMatrixWorld();
    const axis = new Vector3(0,1,0);
    for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 12) {
      for (const dx of [-x,x]) for (const dy of [-y,y]) for (const dz of [-z,z]) {
        const p = new Vector3(dx,dy,dz).applyAxisAngle(axis,yaw).add(target).project(camera);
        const screenX = (p.x + 1) * width / 2, screenY = (1 - p.y) * height / 2;
        assert.ok(screenX >= left && screenX <= left + openWidth, `vehicle width at ${width}×${height}`);
        assert.ok(screenY >= top && screenY <= top + openHeight, `vehicle height at ${width}×${height}`);
      }
    }
  }
});
