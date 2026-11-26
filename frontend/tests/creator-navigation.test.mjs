import assert from "node:assert/strict";
import test from "node:test";
import { nextCreatorControl } from "../src/game/welcome/creatorNavigation.ts";

test("creator arrows track reflowed tile rows and reach the name with either axis", () => {
  let columns = 3;
  const tiles = Array.from({ length: 6 }, (_, index) => ({
    getBoundingClientRect() {
      const left = index % columns * 100, top = Math.floor(index / columns) * 50;
      return { left, top, bottom: top + 44, height: 44, width: 96 };
    },
  }));
  const name = {
    getBoundingClientRect() {
      const top = Math.ceil(tiles.length / columns) * 50;
      return { left: 0, top, bottom: top + 44, height: 44, width: columns * 100 };
    },
  };
  const controls = [...tiles, name];
  assert.equal(nextCreatorControl(controls, tiles[1], "down"), tiles[4]);
  assert.equal(nextCreatorControl(controls, tiles[4], "up"), tiles[1]);
  assert.equal(nextCreatorControl(controls, tiles[4], "down"), name);
  assert.equal(nextCreatorControl(controls, tiles[5], "right"), name);
  assert.equal(nextCreatorControl(controls, name, "left"), tiles[5]);
  assert.equal(nextCreatorControl(controls, name, "up"), tiles[4]);
  columns = 2;
  assert.equal(nextCreatorControl(controls, tiles[1], "down"), tiles[3]);
  assert.equal(nextCreatorControl(controls, tiles[3], "down"), tiles[5]);
  assert.equal(nextCreatorControl(controls, tiles[5], "down"), name);
});

test("single-row controls stay reachable through both direction pairs", () => {
  const tiles = [0, 100].map(left => ({
    getBoundingClientRect: () => ({ left, top: 0, bottom: 80, height: 80, width: 80 }),
  }));
  for (const direction of ["left", "right", "up", "down"])
    assert.equal(nextCreatorControl(tiles, tiles[0], direction), tiles[1]);
});

test("leaving the name editor retains the draft while other fields can still cancel", async () => {
  const { useTextKeyboardStore: keyboard } = await import("../src/store/text/keyboardStore.ts");
  let focus, value;
  const target = name => ({ isConnected: true, getAttribute: () => null, focus: () => { focus = name; } });
  const input = target("input"), row = target("name row"), done = target("Continue");
  const session = {
    id: "name", label: "Character name", initial: "First", value: "First",
    maxLength: 24, secret: false, returnFocus: row, acceptFocus: done,
    onChange: draft => { value = draft; },
  };
  for (const preserveOnExit of [false, true]) {
    keyboard.getState().open({ ...session, preserveOnExit }, true);
    keyboard.getState().edit("Latest");
    keyboard.getState().close(true);
    await Promise.resolve();
    assert.equal(value, preserveOnExit ? "Latest" : "First");
    assert.equal(focus, "name row");
  }
  keyboard.getState().open({ ...session, preserveOnExit: true }, true);
  keyboard.getState().edit("Physical");
  keyboard.getState().close(false, input);
  await Promise.resolve();
  assert.equal(value, "Physical");
  assert.equal(focus, "input", "switching from controller to hardware typing keeps editing the field");
});
