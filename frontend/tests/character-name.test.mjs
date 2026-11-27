import assert from "node:assert/strict";
import test from "node:test";
import { formatCharacterName } from "../src/game/characters/characterName.ts";

test("character names use word initials and retain player spelling inside mixed-case words", () => {
  for (const [saved, display] of [
    ["vesper vega", "Vesper Vega"], ["VESPER VEGA", "Vesper Vega"],
    ["jean-luc o'NEIL", "Jean-Luc O'Neil"], ["d’Arcy McKay", "D’Arcy McKay"],
    ["Track Fox II", "Track Fox II"], ["track fox iii", "Track Fox III"],
    ["Renée Vega7", "Renée Vega7"], ["", ""],
  ]) {
    assert.equal(formatCharacterName(saved), display);
    assert.equal(formatCharacterName(display), display);
  }
});
