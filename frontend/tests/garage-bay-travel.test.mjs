import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
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
