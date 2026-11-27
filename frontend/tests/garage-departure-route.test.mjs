import assert from "node:assert/strict";
import test from "node:test";
import { GarageDepartureDrive } from "../src/game/preview/garageDepartureRoute.ts";
import { GARAGE_PARKING_OBSTACLES as tools } from "../src/game/preview/garageServiceLayout.ts";
import { fitsGarage, initialGaragePose, rearClearOfBays } from "../src/game/preview/garageParkingPhysics.ts";

test("an auto-departure follows the parked pose and stops its bumper at a closed shutter", () => {
  const coupe = { width: 2.07, height: 1.5, length: 4.3 };
  const pickup = { width: 2.41, height: 2.0, length: 5.81 };
  for (const [body, parked] of [[pickup, initialGaragePose()], [coupe, {x:1,z:1,yaw:.72,speed:0}],
    [coupe,{x:1,z:1,yaw:Math.PI,speed:0}]]) {
    const drive = new GarageDepartureDrive(parked, body, tools);
    const pose = {...parked};
    for (let i = 0; i < 800; i++) {
      assert.ok(drive.prepare());
      drive.step(pose,1/60,()=>0,false);
    }
    assert.ok(pose.z > parked.z);
    assert.ok(fitsGarage(pose.x,pose.z,pose.yaw,body,()=>0,tools));
    assert.equal(pose.speed,0);
    let travelled = 0;
    while (!rearClearOfBays(pose,body) && travelled++ < 1600) {
      const before = {...pose};
      drive.step(pose,1/60,()=>1,false);
      assert.ok(Math.hypot(pose.x-before.x,pose.z-before.z) < .055, "car stays on a continuous route");
      assert.ok(fitsGarage(pose.x,pose.z,pose.yaw,body,()=>1,tools));
    }
    assert.ok(rearClearOfBays(pose,body));
  }
});
