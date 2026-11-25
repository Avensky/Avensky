import test from "node:test";
import assert from "node:assert/strict";
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { prepareGarageDisplay } from "../src/game/preview/prepareGarageDisplay.ts";
import { applyGarageLighting } from "../src/theme/garageLighting.ts";
import { selectedGarageTheme, UI_THEMES } from "../src/theme/catalog.ts";
import { sanitizeGarageEffects } from "../src/store/preferences/garageEffects.ts";

test("new rooms use Pit Wall while saved room and follow-interface choices persist", () => {
  for (const saved of [{}, { theme: "unknown" }, { theme: null }, { theme: "__proto__" }]) {
    assert.equal(selectedGarageTheme({ theme: "forest", garageEffects: sanitizeGarageEffects(saved) }), "pit-wall");
  }
  assert.equal(selectedGarageTheme({ theme: "forest", garageEffects: sanitizeGarageEffects({ theme: "auto" }) }), "forest");
  assert.equal(selectedGarageTheme({ theme: "white", garageEffects: sanitizeGarageEffects({ theme: "forest" }) }), "forest");
});

test("all garage themes recolor the authored walls in place", () => {
  const source = new Group();
  const geometry = new PlaneGeometry();
  const material = new MeshStandardMaterial({ name: "Murs" });
  source.add(new Mesh(geometry, material));
  const display = prepareGarageDisplay(source);
  const wall = display.root.children[0];
  for (const [theme, palette] of Object.entries(UI_THEMES)) {
    applyGarageLighting(display.root, theme, false);
    assert.equal(wall.geometry, geometry);
    assert.equal("#" + wall.material.color.getHexString(), palette["garage-wall"]);
  }
  assert.equal(material.color.getHex(), 0xffffff);
  display.dispose();
  material.dispose();
  geometry.dispose();
});

test("the workshop floor uses the authored slab under the removable vehicle platform", () => {
  const source = new Group();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    0,0,0, 2,0,0, 0,0,2, 0,0,0, 0,2,0, 2,0,0,
  ], 3));
  const shell = new Mesh(geometry, new MeshStandardMaterial({ name: "Fond" }));
  shell.name = "BASE_Full";
  const tiles = new Group();
  tiles.name = "Sol_CUBE";
  source.add(shell, tiles);
  const display = prepareGarageDisplay(source);
  const slab = display.root.getObjectByName("BASE_Full");
  assert.deepEqual(slab.geometry.groups.map(({ materialIndex }) => materialIndex), [1, 0]);
  assert.equal(slab.material[1].name, "Workshop slab");
  assert.ok(slab.material[1].roughness >= .35 && slab.material[1].roughness <= .5);
  assert.equal(display.root.getObjectByName("Sol_CUBE").visible, false);
  assert.equal(tiles.visible, true);
  assert.equal(geometry.groups.length, 0);
  display.dispose();
  geometry.dispose();
  shell.material.dispose();
});

test("the 0999 counter borrows the original zero segments across nested author transforms", () => {
  const source = new Group(), bank = new Group(), geometry = new PlaneGeometry();
  const zero = new Mesh(geometry, new MeshStandardMaterial({ name: "LIGHT" }));
  zero.name = "Cube026";
  zero.position.set(1, 2, 3);
  bank.scale.setScalar(2);
  bank.position.set(3, 6, 9);
  bank.add(zero); source.add(bank);
  const front = new Group(); front.name = "Cube024"; source.add(front);
  const display = prepareGarageDisplay(source);
  const leading = display.root.getObjectByName("garage-counter-leading-zero");
  assert.equal(leading.geometry, geometry);
  assert.equal(leading.material, display.root.getObjectByName("Cube026").material);
  assert.deepEqual(leading.position.toArray(), [5 - 22.60, 10, 15 + 1.13]);
  assert.equal(source.getObjectByName(leading.name), undefined);
  display.dispose();
});

test("the work lamp and neon use their real transformed faces and distinct light colors", async () => {
  const { collectGarageFixtures } = await import("../src/game/preview/garageFixtures.ts");
  const room = new Group(), face = new MeshStandardMaterial({ name: "LIGHT " }), geometry = new PlaneGeometry();
  for (const [name, x] of [["Cube.001", 3], ["Base_Light.001", -4]]) {
    const fixture = new Group(); fixture.userData.name = name; fixture.position.set(x, 3, -2);
    fixture.add(new Mesh(geometry, face)); room.add(fixture);
  }
  room.position.x = 1;
  const display = prepareGarageDisplay(room);
  const fixtures = collectGarageFixtures(display.root);
  applyGarageLighting(display.root, "navy", false, 0);
  fixtures.updateEmission();
  const lamp = fixtures.lights.getObjectByName("garage-work-light-3x4");
  const rack = fixtures.lights.getObjectByName("garage-neon-rack");
  assert.deepEqual(lamp.position.toArray(), [4, 3, -2]);
  assert.deepEqual(rack.position.toArray(), [-3, 3, -2]);
  assert.deepEqual(lamp.target.position.toArray(), [0, .65, 0]);
  assert.ok(lamp.intensity > 0 && lamp.color.r > lamp.color.b);
  assert.equal(rack.intensity, 0);
  applyGarageLighting(display.root, "forest", false);
  fixtures.updateEmission();
  assert.ok(rack.intensity > 0 && rack.color.g > rack.color.r);
  assert.equal(face.emissive.getHex(), 0);
  fixtures.dispose(); display.dispose(); geometry.dispose(); face.dispose();
});

test("old saves use concrete and brushed steel persists independently of the garage theme", () => {
  assert.equal(sanitizeGarageEffects({ theme: "forest" }).floorFinish, "concrete");
  assert.equal(sanitizeGarageEffects({ floorFinish: "unknown" }).floorFinish, "concrete");
  assert.equal(sanitizeGarageEffects({ theme: "auto", floorFinish: "metal" }).floorFinish, "metal");
});
