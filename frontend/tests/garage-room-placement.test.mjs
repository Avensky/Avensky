import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GARAGE_LAYOUT as initial, GARAGE_PROP_IDS, GARAGE_PARKING, garagePropFootprint,
  garageParkingObstacles, garagePlacementError, validateGarageRoomLayout,
} from "../src/game/preview/garageServiceLayout.ts";
import { garageMenuLandmarks } from "../src/game/preview/garageMenuLandmarks.ts";
import { fitsGarage } from "../src/game/preview/garageParkingPhysics.ts";

test("the six editable stations leave the departure aisle and the workshop center free", () => {
  assert.ok(validateGarageRoomLayout(initial));
  assert.equal(GARAGE_PROP_IDS.length, 6);
  const pickup = { width: 2.41, length: 5.81, height: 1.95 };
  for (let z = GARAGE_PARKING.position[2]; z < 13; z += .14)
    assert.ok(fitsGarage(GARAGE_PARKING.position[0], z, 0, pickup, () => 1, garageParkingObstacles(initial)));
  assert.ok(fitsGarage(1, .5, 0, { width: 4.50, length: 5.0, height: 2 }, () => 0));
  for (const invalid of [
    { x: 0, z: 0, yaw: 0 }, { x: -3.18, z: 7, yaw: 0 }, { x: -.1, z: 8.25, yaw: 0 },
    { x: -5.23, z: -.2, yaw: Math.PI }, initial.desk,
    { x: NaN, z: 2, yaw: 0 }, { x: 1, z: 4, yaw: 50 }, { x: 8.48, z: 2, yaw: 0 },
  ]) assert.ok(garagePlacementError({ ...initial, jack: invalid }));
  assert.ok(!validateGarageRoomLayout({ ...initial, tire: initial.shelf }));
  assert.ok(!validateGarageRoomLayout({ ...initial, shelf: null }));
});

test("moving and rotating a station moves its real collider and its projected label together", () => {
  const moved = { ...initial, lockers: { x: 7.50, z: 4.62, yaw: -Math.PI / 2 } };
  assert.equal(garagePlacementError(moved), undefined);
  const { x, z, yaw } = garagePropFootprint("lockers", moved.lockers);
  assert.ok(Math.abs(x - 7.42) < 1e-6 && Math.abs(z - 5.32) < 1e-6);
  assert.equal(yaw, -Math.PI / 2);
  const probe = { width: .20, length: .25, height: .3 };
  assert.equal(fitsGarage(x, z, 0, probe, () => 0, garageParkingObstacles(initial)), true);
  assert.equal(fitsGarage(x, z, 0, probe, () => 0, garageParkingObstacles(moved)), false);
  assert.deepEqual(garageMenuLandmarks(moved, { x: 1, z: 6 }).vehicle, [1, 1.22, 6]);
  const [markerX, , markerZ] = garageMenuLandmarks(moved).wardrobe;
  assert.ok(Math.abs(markerX - 7.38) < 1e-6 && Math.abs(markerZ - 4.94) < 1e-6);
});
