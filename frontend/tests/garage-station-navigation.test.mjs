import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createGarageStationNavigation } from "../src/game/menus/garageStationNavigation.ts";

function button(x, y, width = 80, height = 44) {
  return { getBoundingClientRect: () => ({ left: x - width / 2, top: y - height / 2, width, height }) };
}

test("each direction visits every available station once before wrapping, and its opposite retraces the route", () => {
  const enter = button(450, 118), wardrobe = button(365, 463), vehicle = button(706, 236), editor = button(166, 291);
  const wide = [enter, wardrobe, vehicle, editor];
  const grid = [button(98, 683), button(276, 683), button(98, 732), button(276, 732)];
  const directions = { right: "left", left: "right", up: "down", down: "up" };
  for (const controls of [wide, grid, grid.slice(0, 3), grid.slice(0, 1)]) {
    for (const [direction, opposite] of Object.entries(directions)) {
      for (const start of controls) {
        const navigation = createGarageStationNavigation();
        const visited = [];
        let active = start;
        for (let step = 0; step < controls.length; step++) {
          visited.push(active);
          active = navigation.next(controls, active, direction);
        }
        assert.deepEqual(new Set(visited), new Set(controls));
        assert.equal(active, start);
        for (const previous of visited.reverse()) {
          active = navigation.next(controls, active, opposite);
          assert.equal(active, previous);
        }
      }
    }
  }
  const across = createGarageStationNavigation();
  assert.equal(across.next(grid, grid[0], "right"), grid[1]);
  assert.equal(across.next(grid, grid[1], "right"), grid[2]);
  const down = createGarageStationNavigation();
  assert.equal(down.next(grid, grid[0], "down"), grid[2]);
  assert.equal(down.next(grid, grid[2], "down"), grid[1]);
});

test("a held or noisy diagonal only moves garage focus once while the camera travels", async () => {
  const vite = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, ws: false, hmr: false }, appType: "custom", logLevel: "error" });
  try {
    const { createMenuDirections } = await vite.ssrLoadModule("/src/controls/menuDirections.ts");
    const directions = createMenuDirections();
    const pad = { axes: [0, 0, 0, 0] };
    const step = (x, y, time, edges = []) => {
      pad.axes = [x, y, 1, 0]; // The garage's right stick rotates the model.
      return directions.read(pad, edges, time, "stations");
    };
    assert.equal(step(0, 0, 0), undefined);
    assert.equal(step(.85, .72, 16), "right");
    assert.equal(step(.76, .79, 32), undefined);
    assert.equal(step(.78, .80, 500), undefined);
    assert.equal(step(.15, .9, 516), "down");
    assert.equal(step(0, .43, 720), undefined);
    assert.equal(step(0, 0, 736), undefined);
    assert.equal(step(0, .72, 752), "down");
    const left = []; left[14] = true;
    assert.equal(step(0, .72, 768, left), "left");
    assert.equal(step(0, .72, 784), undefined);
    directions.reset();
    assert.equal(step(-.65, 0, 790), "left");
  } finally {
    await vite.close();
  }
});
