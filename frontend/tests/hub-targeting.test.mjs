import assert from "node:assert/strict";
import test from "node:test";
import { Quaternion, Ray, Vector3 } from "three";
import { canReachHubCar, pickHubCar } from "../src/game/hub/hubTargeting.ts";

const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
const car = (x, z) => ({
  vehicle_id: "brz",
  position: [x, .4, z],
  rotation: rotation.toArray(),
  collider: { chassis_offset: [0, .31, 0], chassis_half_extents: [.88, .55, 2.1] },
});

test("hub targeting selects the first rotated car on the aim ray within range", () => {
  const near = car(0, 5), far = car(0, 10);
  const ray = new Ray(new Vector3(1.8, .7, 0), new Vector3(0, 0, 1));
  assert.equal(pickHubCar(ray, [far, near])?.car, near);
  assert.equal(pickHubCar(ray, [near], 3), undefined);
});

test("a rotated BRZ can be reached near either door but not high above it", () => {
  const parked = car(0, 0);
  assert.equal(canReachHubCar([0, 0, 1.45], parked), true);
  assert.equal(canReachHubCar([0, 0, -1.45], parked), true);
  assert.equal(canReachHubCar([0, 3, -1.45], parked), false);
  assert.equal(canReachHubCar([0, 0, 4], parked), false);
});
