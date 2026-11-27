import test from "node:test";
import assert from "node:assert/strict";
import { GarageBayMotion } from "../src/game/preview/garageBayMotion.ts";

test("a sign-in garage sleeps until a bay motor starts and after its sheet clears the opening", () => {
  const doors = new GarageBayMotion();
  const lifts = new Float32Array(3);
  let wakes = 0;
  const release = doors.subscribe(() => wakes++);
  const start = 120000;
  assert.equal(doors.sample(lifts, start), false);
  doors.setOpen(0, true, start);
  doors.setOpen(0, true, start + 10);
  assert.equal(wakes, 1, "repeated proximity updates do not restart the motor");
  assert.equal(doors.sample(lifts, start), true);
  assert.equal(lifts[0], 0, "the long idle before entry does not advance the shutter");
  const middle = start + 925;
  assert.equal(doors.sample(lifts, middle), true);
  assert.equal(doors.opening(0, middle), .5);
  assert.deepEqual([...lifts], [.5, 0, 0]);
  assert.equal(doors.sample(lifts, start + 1850), false);
  assert.deepEqual([...lifts], [1, 0, 0]);
  release();
  doors.setOpen(1, true, start + 3000);
  assert.equal(wakes, 1);
});

test("the bay can safely reopen while closing and a neighboring parked car can use its own door", () => {
  const doors = new GarageBayMotion();
  const lifts = new Float32Array(3);
  doors.setOpen(1, true, 0);
  doors.setOpen(1, false, 2000);
  doors.sample(lifts, 2400);
  const reversing = doors.opening(1, 2400);
  assert.ok(0 < reversing && reversing < 1);
  doors.setOpen(1, true, 2400);
  doors.setOpen(2, true, 2400);
  assert.equal(doors.opening(1, 2400), reversing);
  assert.ok(doors.opening(1, 2500) > reversing);
  assert.ok(0 < doors.opening(2, 2500) && doors.opening(2, 2500) < 1);
  assert.equal(doors.sample(lifts, 10000), false);
  assert.deepEqual([...lifts], [0, 1, 1]);
});
