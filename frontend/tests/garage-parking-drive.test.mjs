import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { approachBay, bodySpan, fitsGarage, initialGaragePose, moveGarageCar, rearClearOfBays } from "../src/game/preview/garageParkingPhysics.ts";
import { GARAGE_BAY_DOORS } from "../src/game/preview/garageDoorLayout.ts";
import { DEFAULT_GARAGE_LAYOUT as GARAGE_WORKSHOP } from "../src/game/preview/garageServiceLayout.ts";

const coupe = { width: 2.03, length: 4.34, height: 1.24 };
const pickup = { width: 2.41, length: 5.81, height: 1.95 };
const gas = { throttle: 1, steer: 0, brake: 0 }, reverse = { ...gas, throttle: -1 };
const open = () => 1, closed = () => 0;
function advance(pose, car, control, seconds, door = open, hz = 60) {
  for (let i = 0; i < Math.round(seconds * hz); ++i) moveGarageCar(pose, car, control, 1 / hz, door);
}

test("the car and largest pickup leave their stall only under input and only through a clear shutter", () => {
  for (const car of [coupe, pickup]) {
    const pose = initialGaragePose(), spawn = { ...pose };
    assert.ok(fitsGarage(pose.x, pose.z, pose.yaw, car, closed));
    advance(pose, car, { ...gas, throttle: 0 }, 5);
    assert.deepEqual(pose, spawn);
    advance(pose, car, gas, 8, closed);
    const wall = GARAGE_BAY_DOORS[0].position[2];
    assert.equal(approachBay(pose, car), 0);
    assert.equal(pose.speed, 0);
    assert.ok(pose.z + car.length / 2 < wall);
    assert.ok(wall - pose.z - car.length / 2 < .25);
    const waiting = { ...pose };
    advance(pose, car, gas, 2, () => (car.height - .04) / GARAGE_BAY_DOORS[0].height);
    assert.ok(Math.abs(waiting.z - pose.z) < .01);
    advance(pose, car, gas, 3);
    assert.ok(rearClearOfBays(pose, car));
    advance(pose, car, { ...gas, throttle: 0, brake: 1 }, 1);
    assert.equal(pose.speed, 0);
    advance(pose, car, reverse, 6);
    assert.ok(pose.z < wall - car.length / 2);
  }
});

test("each bay accepts an aligned car, and the door jambs, walk-outs, crane and desk block it", () => {
  for (const [i,bay] of GARAGE_BAY_DOORS.entries()) {
    const [x,,z] = bay.position;
    assert.equal(approachBay({ x,z,yaw:0,speed:0 }, coupe),i);
    assert.ok(fitsGarage(x,z,0,coupe,index => Number(index === i)));
    assert.equal(fitsGarage(x + bay.width / 2,z,0,coupe,open),false);
  }
  assert.equal(fitsGarage(-5.98,8.75,0,coupe,open),false);
  for (const prop of [GARAGE_WORKSHOP.desk, GARAGE_WORKSHOP.crane, GARAGE_WORKSHOP.toolbox, GARAGE_WORKSHOP.lockers])
    assert.equal(fitsGarage(prop.x,prop.z,prop.yaw,coupe,open),false);
  assert.equal(fitsGarage(9,2,0,coupe,open),false);
});

test("steering follows the direction of travel and movement is stable across frame rates", () => {
  const poses = [30,60,120].map(hz => {
    const p = { x:2, z:0, yaw:0, speed:0 };
    advance(p,coupe,{ ...gas, steer:.4 },1,open,hz);
    return p;
  });
  for (const p of poses) {
    assert.ok(p.x < 2 && p.yaw < 0 && p.z > 0);
    assert.ok(Math.abs(p.x-poses[0].x) < .005 && Math.abs(p.z-poses[0].z) < .005);
  }
  const p = { x:2,z:0,yaw:0,speed:0 };
  advance(p,coupe,{ ...reverse, steer:.4 },1);
  assert.ok(p.yaw > 0 && p.z < 0);
  assert.equal(bodySpan(coupe,0).z,coupe.length/2);
});

test("holding the exit sends one deployment, and canceled and failed admissions release the driver", { timeout: 10000 }, async () => {
  const fixture = "virtual:garage-admission-fixture";
  const fixtureModule = "\0" + fixture;
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [{
      name: "garage-admission-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id.endsWith("/driveIntoOpenWorld") || id === fixture) return fixtureModule;
      },
      load(id) {
        if (id !== fixtureModule) return;
        return `
          let notify;
          export let count = 0;
          export const nextAttempt = () => new Promise(resolve => { notify = resolve; });
          export const driveIntoOpenWorld = (hero, valid) => new Promise((resolve, reject) => {
            ++count;
            notify({ hero, valid, resolve, reject });
          });
        `;
      },
    }],
  });
  try {
    const { useGarageParking: store, setParkingInput, readParkingInput } =
      await server.ssrLoadModule("/src/game/preview/garageParkingStore.ts");
    const net = await server.ssrLoadModule(fixture);
    const receive = net.nextAttempt();
    store.getState().start();
    setParkingInput("touch", 1, -1);
    assert.deepEqual(readParkingInput(), { throttle: 1, steer: -1, brake: 0 });
    const pending = store.getState().depart("brz");
    await store.getState().depart("brz");
    const first = await receive;
    assert.equal(net.count, 1);
    assert.equal(first.hero, "brz");
    assert.deepEqual(readParkingInput(), { throttle: 0, steer: 0, brake: 0 });
    assert.ok(first.valid());
    store.getState().park();
    assert.ok(first.valid(), "Park does not abandon an already submitted deployment");
    store.getState().leave();
    store.getState().start();
    assert.equal(first.valid(), false);
    first.reject(Error("Stale response"));
    await pending;
    assert.equal(store.getState().error, "");

    const receiveRetry = net.nextAttempt();
    const retry = store.getState().depart("skyline");
    const second = await receiveRetry;
    second.reject(Error("The Harbor is full"));
    await retry;
    assert.ok(store.getState().driving);
    assert.equal(store.getState().joining, false);
    assert.equal(store.getState().error, "The Harbor is full");
    store.getState().clearError();
    assert.equal(store.getState().error, "");
  } finally {
    await server.close();
  }
});
