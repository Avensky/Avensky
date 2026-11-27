import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot, extend } from "@react-three/fiber";
import * as THREE from "three";
import { createServer } from "vite";

test("the parked car is driveable from its own grounded exterior while a detailed model is unavailable", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false },
    define: { __STAGING_ASSET_RELEASE__: JSON.stringify({ id: "test", paths: {} }) },
  });
  extend(THREE);
  const renderer = createRoot(new EventTarget());
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    const { GarageParkedVehicle } = await vite.ssrLoadModule("/src/game/preview/GarageParkedVehicle.tsx");
    const { garageParkingVehicle } = await vite.ssrLoadModule("/src/game/preview/garageParkingVehicle.ts");
    const { fleetArt } = await vite.ssrLoadModule("/src/vehicles/fleetAssets.ts");
    const { useHeroLoadouts, FACTORY_APPEARANCE } = await vite.ssrLoadModule("/src/vehicles/cosmetics/heroLoadouts.ts");
    const loadouts = useHeroLoadouts.getState();
    await renderer.configure({ frameloop: "never", size: { width: 640, height: 360, top: 0, left: 0 },
      gl: { render() {}, setSize() {}, setPixelRatio() {}, getPixelRatio: () => 1 } });
    let store, footprint;
    const onFootprint = size => { footprint = size; };
    const factory = fleetArt("brz", "medium").scene.getObjectByName("paint").material;
    const original = factory.color.getHexString();
    loadouts.adopt("driver", "brz", { brz: { ...FACTORY_APPEARANCE, body: "#e40822", finish: "matte" } });
    await act(async () => { store = renderer.render(createElement(GarageParkedVehicle, { onFootprint })); });
    const car = store.getState().scene.getObjectByName("garage-parked-vehicle");
    assert.equal(car.userData.tier, "seed");
    assert.equal(car.userData.model, "brz");
    const exterior = car.children[0];
    const bounds = new THREE.Box3().setFromObject(exterior);
    assert.ok(Math.abs(bounds.min.y) < .001);
    assert.ok(Math.abs(bounds.max.x + bounds.min.x) < .001 && Math.abs(bounds.max.z + bounds.min.z) < .001);
    assert.ok(footprint.width > 1.85 && footprint.width < 2.1 && footprint.length > 4 && footprint.length < 4.6);
    assert.ok(Math.abs(footprint.height - bounds.max.y) < .001);
    const paint = exterior.getObjectByName("paint").material;
    assert.notEqual(paint, factory);
    assert.equal(paint.color.getHexString(), "e40822");
    assert.equal(factory.color.getHexString(), original);

    await act(async () => loadouts.adopt("driver", "sierra"));
    assert.equal(car.userData.model, "sierra");
    assert.ok(footprint.length > 5.5 && footprint.width > 2.2);
    await act(async () => loadouts.adopt("driver", "louisiana"));
    assert.equal(car.userData.model, "brz");
    assert.equal(useHeroLoadouts.getState().defaultHero, "louisiana");
    for (const favorite of ["tank", "hawaii-rescue", "louisiana", "unknown"]) {
      const loan = garageParkingVehicle(favorite);
      assert.ok(loan.loaner);
      assert.equal(loan.model, "brz");
      assert.equal(loan.heroId, "brz");
    }
    assert.equal(garageParkingVehicle("sierra").loaner, false);
  } finally {
    await act(async () => renderer.unmount());
    await vite.close();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
