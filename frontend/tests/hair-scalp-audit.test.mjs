import assert from "node:assert/strict";
import test from "node:test";
import { parseHairScalpAudit } from "../src/game/characters/fittedWardrobe/hairScalpAudit.mjs";

test("hair scalp diagnostic defaults to off", () => {
  assert.equal(parseHairScalpAudit("", true), "off");
  assert.equal(parseHairScalpAudit("?other=yes", true), "off");
  assert.equal(parseHairScalpAudit("?hairScalpAudit=invalid", true), "off");
});

test("diagnostic comparison modes can be selected without UI state", () => {
  for (const mode of ["baseline", "backing", "legacy-cap", "cap-only"]) {
    assert.equal(parseHairScalpAudit("?hairScalpAudit=" + mode, true), mode);
  }
});

test("disabled diagnostic ignores URL requests (production guard)", () => {
  for (const mode of ["baseline", "backing", "legacy-cap", "cap-only"]) {
    assert.equal(parseHairScalpAudit("?hairScalpAudit=" + mode, false), "off");
  }
});

test("diagnostic parses URL search params without interpreting substrings", () => {
  assert.equal(parseHairScalpAudit("?other=legacy-cap&hairScalpAudit=backing", true), "backing");
  assert.equal(parseHairScalpAudit("?hairScalpAudit=legacy-cap-extra", true), "off");
});
