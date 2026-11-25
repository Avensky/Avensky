import test from "node:test";
import assert from "node:assert/strict";
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry, Texture } from "three";
import { createGarageWalls } from "../src/game/preview/garageWalls.ts";
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

test("all saved palettes repaint one set of inward-facing wall panels with the entry colors", () => {
  const texture = new Texture();
  const { mesh, dispose } = createGarageWalls(texture);
  const { geometry, material } = mesh;
  assert.equal(geometry.index.count / 3, 24);
  assert.equal(geometry.groups.length, 3);
  const normals = geometry.getAttribute("normal");
  assert.equal(normals.getZ(0), 1);
  assert.equal(normals.getX(4), -1);
  for (const [theme, palette] of Object.entries(UI_THEMES)) {
    applyGarageLighting(mesh, theme, false);
    assert.equal(mesh.geometry, geometry);
    for (const surface of material) {
      assert.equal("#" + surface.color.getHexString(), palette[surface.userData.garageSurface]);
      assert.equal(surface.map, texture);
    }
  }
  let textureDisposals = 0;
  texture.addEventListener("dispose", () => textureDisposals++);
  dispose();
  assert.equal(textureDisposals, 0);
  texture.dispose();
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
