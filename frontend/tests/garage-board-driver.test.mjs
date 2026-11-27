import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Group, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createServer } from "vite";

test("the same character walks to their driver door, boards the seat, and moves with the departing car", async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom", logLevel: "error" });
  try {
    const { boardGarageCar, prepareBoardingPath } = await vite.ssrLoadModule("/src/game/preview/boardGarageCar.ts");
    const { boardingDoor, boardingCar, parkedDriverStation } = await vite.ssrLoadModule("/src/game/preview/garageBoarding.ts");
    const { garageParkingPose: parked } = await vite.ssrLoadModule("/src/game/preview/garageParkingCamera.ts");
    const { fleetArt } = await vite.ssrLoadModule("/src/vehicles/fleetAssets.ts");
    const { installFleetDoor } = await vite.ssrLoadModule("/src/game/preview/garageFleetDoor.ts");
    const initial = { ...parked };
    const carAtHome = new Group(); carAtHome.position.set(parked.x, 0, parked.z);
    assert.throws(() => prepareBoardingPath(new Vector3(), carAtHome, boardingCar, [.36,.4,-.17],
      [{ x: parked.x + boardingCar.width / 2 + .29, z: parked.z - .44, yaw: 0, halfWidth: .35, halfLength: .55 }]),
      /driver door is blocked/, "a manually parked car beside a solid cabinet never walks its driver through the cabinet");
    for (const [gender, model] of [["female", "brz"], ["male", "ae86"]]) {
      Object.assign(parked, initial);
      const scene = new Group(), actor = new Group(), skin = new Group();
      const { scene: driver } = await new GLTFLoader().parseAsync(await readFile(`tests/fixtures/villager-${gender}-rig.json`, "utf8"), "");
      scene.add(actor); actor.add(skin); skin.add(driver);
      const hip = () => driver.getObjectByName("thigh_l").getWorldPosition(new Vector3())
        .lerp(driver.getObjectByName("thigh_r").getWorldPosition(new Vector3()), .5);
      const head = () => driver.getObjectByName("head").getWorldPosition(new Vector3());
      const home = hip(), standingHead = head();
      let maxSwing = 0, lastOpenHip, seconds = 0;
      const boarding = boardGarageCar(actor,driver,model);
      while (seconds < 25) {
        const done = boarding.sample(seconds);
        if (boardingDoor.opening > maxSwing) { maxSwing = boardingDoor.opening; lastOpenHip = hip(); }
        if (done) break;
        seconds += 1/25;
      }
      assert(seconds < 25 && maxSwing > .98);
      const station = parkedDriverStation(model, boardingCar), sign = Math.sign(station.seat[0]);
      assert((lastOpenHip.x - initial.x) * sign > boardingCar.width/2, `${model} approaches its driver's side`);
      assert(lastOpenHip.distanceTo(home) > .7);
      assert(standingHead.y - head().y > .28 && head().y < boardingCar.height + .035, "head is seated under the roof");
      const seated = hip();
      assert(Math.abs(seated.x - initial.x - station.seat[0]) < .015);
      assert(Math.abs(seated.z - initial.z - station.seat[2]) < .015);
      assert.equal(boardingDoor.opening, 0);
      parked.z += 1.75;
      boarding.sample(seconds + 1);
      assert(hip().distanceTo(seated.add(new Vector3(0,0,1.75))) < .002, "same seated skeleton follows the car");
      boarding.dispose();
      assert(home.distanceTo(hip()) < .003, "cancellation restores the original roster pose");

      const car = new Group(), source = fleetArt(model,"medium").scene.clone(true);
      car.add(source);
      const closedMaterials = source.children.map(part => part.material);
      const door = installFleetDoor(car, source, station.seat, boardingCar, false);
      door.set(1);
      const panel = car.getObjectByName("garage-driver-door");
      assert(panel.children.length && Math.abs(panel.rotation.y) > .9);
      panel.children.forEach((mesh,i) => {
        assert.equal(mesh.geometry, source.children[i].geometry, "the door uses the equipped exterior geometry");
        assert.notEqual(source.children[i].material, closedMaterials[i]);
      });
      door.dispose();
      assert(!car.getObjectByName("garage-driver-door"));
      assert.deepEqual(source.children.map(part => part.material), closedMaterials);
    }
  } finally { await vite.close(); }
});

test("a cold Enter World waits for its own character and equipped car and reports recoverable load failures", async () => {
  const { act, createElement } = await import("react");
  const { createRoot, extend } = await import("@react-three/fiber");
  const THREE = await import("three");
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom", logLevel: "error" });
  const renderer = createRoot(new EventTarget());
  const previous = globalThis.window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    extend(THREE);
    const { GarageBoardingPerformance } = await vite.ssrLoadModule("/src/game/preview/GarageBoardingPerformance.tsx");
    const { useGarageParking } = await vite.ssrLoadModule("/src/game/preview/garageParkingStore.ts");
    await renderer.configure({ frameloop: "never", size: { width: 640, height: 360, top: 0, left: 0 },
      gl: { render() {}, setSize() {}, setPixelRatio() {}, getPixelRatio: () => 1 } });
    let elapsed = 0, finished = 0, error = "", onTimeout;
    globalThis.window = { setTimeout(fn, delay) { if (delay === 45000) onTimeout = fn; return 1; }, clearTimeout() {} };
    useGarageParking.setState({ departurePhase: "boarding", finishBoarding() { finished++; },
      failDeparture(message) { error = message; } });
    let store;
    const render = async (id, key) => act(async () => { store = renderer.render(createElement(GarageBoardingPerformance,
      { model: "brz", characterId: id, key })); });
    await render("driver", 1);
    const frame = seconds => { for (let i = 0; i < seconds*20; i++) store.getState().advance(elapsed += .05, false); };
    frame(5);
    assert.equal(error, ""); assert.equal(finished, 0, "a download > 2 seconds never rolls an empty car");
    onTimeout();
    assert.match(error, /still loading/); error = "";
    const actor = new Group(), rig = new Group();
    actor.name = "roster-character-pivot"; rig.name = "garage-driver"; actor.add(rig);
    actor.userData.actorAsset = { rigId: "driver", available: false };
    store.getState().scene.add(actor); frame(.1);
    assert.match(error, /character could not load/); error = "";
    actor.userData.actorAsset.available = true;
    const { scene: driver } = await new GLTFLoader().parseAsync(await readFile("tests/fixtures/villager-female-rig.json", "utf8"), "");
    rig.add(driver);
    frame(10);
    assert.equal(finished, 0, "having the character alone cannot start the car");
    const car = new Group(); car.name = "garage-parked-vehicle"; car.userData.model = "brz";
    const body = new Group(); body.add(new Group()); car.add(body);
    store.getState().scene.add(car);
    const head = () => driver.getObjectByName("head").getWorldPosition(new Vector3());
    const home = head(); frame(1);
    assert.equal(finished, 0); assert(head().distanceTo(home) > .4, "the visible actor approaches the loaded car first");
    frame(9);
    assert(finished > 0);
    await render(undefined, 2);
    assert.match(error, /Choose a character/);
  } finally {
    await act(async () => { renderer.unmount(); });
    if (previous) globalThis.window = previous; else delete globalThis.window;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    await vite.close();
  }
});
