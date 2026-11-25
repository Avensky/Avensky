import test from "node:test";
import assert from "node:assert/strict";
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from "three";
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
  assert.notEqual(leading.material, display.root.getObjectByName("Cube026").material);
  assert.equal(leading.material.emissiveIntensity, 0);
  assert.equal(leading.material.emissive.getHex(), 0);
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
  const lamp = fixtures.lights.getObjectByName("garage-work-light-3x4-0");
  const rack = fixtures.lights.getObjectByName("garage-neon-rack-0");
  assert.ok(lamp.position.distanceTo(new Vector3(4,3,-2)) < .04);
  assert.ok(rack.position.distanceTo(new Vector3(-3,3,-2)) < .04);
  assert.equal(lamp.isPointLight, true);
  assert.equal(lamp.intensity, 0);
  assert.equal(rack.intensity, 0);
  fixtures.updateEmission({rack:0});
  assert.equal(rack.intensity,0);
  applyGarageLighting(display.root, "forest", false);
  fixtures.updateEmission();
  assert.ok(rack.intensity > 0 && rack.color.g > rack.color.r);
  assert.equal(face.emissive.getHex(), 0);
  fixtures.dispose(); display.dispose(); geometry.dispose(); face.dispose();
});

test("old saves use concrete and brushed steel persists independently of the garage theme", () => {
  assert.equal(sanitizeGarageEffects({ theme: "forest" }).floorFinish, "concrete");
  assert.equal(sanitizeGarageEffects({}).rackBrightness, 1);
  assert.equal(sanitizeGarageEffects({rackBrightness:NaN}).rackBrightness, 1);
  assert.equal(sanitizeGarageEffects({workBrightness:10}).workBrightness, 2);
  assert.equal(sanitizeGarageEffects({ceilingBrightness:-2}).ceilingBrightness, 0);
  assert.equal(sanitizeGarageEffects({ floorFinish: "unknown" }).floorFinish, "concrete");
  assert.equal(sanitizeGarageEffects({ theme: "auto", floorFinish: "metal" }).floorFinish, "metal");
});

test("a merged bulb mesh produces one local source per connected bulb and independent bank controls", async () => {
  const { collectGarageFixtures } = await import("../src/game/preview/garageFixtures.ts");
  const geometry = new BufferGeometry(), vertices = [];
  for (let i = 0; i < 18; i++) {
    const x = (i % 3) * 2, y = Math.floor(i / 3) * 2;
    vertices.push(x,y,0, x+1,y,0, x,y+1,0, x+1,y,0, x+1,y+1,0, x,y+1,0);
  }
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  const parent = new Group(); parent.userData.name = "Base_Light.001";
  parent.position.set(4, 2, -3); parent.scale.setScalar(.2);
  const material = new MeshStandardMaterial({name:"LIGHT ", emissive:"#ffead5", emissiveIntensity:2});
  parent.add(new Mesh(geometry, material));
  const fixtures = collectGarageFixtures(parent);
  fixtures.updateEmission();
  const bulbs = fixtures.lights.children.filter(n => n.isPointLight);
  assert.equal(bulbs.length, 18);
  assert.equal(new Set(bulbs.map(n => n.position.toArray().join(","))).size, 18);
  assert.equal(fixtures.lights.children.filter(n => n.isSprite).length, 18);
  const intensity = bulbs[0].intensity;
  fixtures.updateEmission({rack:.5});
  assert.equal(bulbs[0].intensity, intensity / 2);
  fixtures.updateEmission({rack:.5});
  assert.equal(bulbs[0].intensity, intensity / 2, "repeated edits cannot compound");
  fixtures.updateEmission({rack:0});
  assert.ok(bulbs.every(n => n.intensity === 0));
  assert.equal(material.emissiveIntensity, 0);
  fixtures.dispose(); geometry.dispose(); material.dispose();
});
