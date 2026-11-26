import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateLayerRules, assertLayerRules } from "../../packages/wardrobe-catalog/validate-layer-rules.mjs";

const original = JSON.parse(readFileSync(new URL("../../packages/wardrobe-catalog/layer-rules.json", import.meta.url), "utf8"));
const copy = () => structuredClone(original);
const errors = (m, code) => validateLayerRules(m).errors.filter(e => e.code === code);
const byId = id => original.relationships.find(r => r.id === id);

test("checked-in wardrobe manifest is structurally and semantically valid", () => {
  const input = copy();
  assert.strictEqual(assertLayerRules(input), input);
  assert.equal(validateLayerRules(input).valid, true);
  assert.equal(original.schemaVersion, 1);
  assert.equal(original.itemOverrides.length, 0, "No unverified assets auto-approved");
});

test("exclusive corset/skirt, coat/belt, cuff and pants/boot modes invert safely", () => {
  for (const [innerRule, outerRule, cl, mode, left, right] of [
    ["corset-tucked-below-skirt","corset-over-skirt","corset","waist","tucked","over"],
    ["belt-under-coat","belt-over-coat","belt","placement","under-coat","over-coat"],
    ["pants-tucked-into-boots","pants-over-boots","boot","cuff","pants-tucked","pants-over"],
    ["gloves-under-coat-cuff","gauntlet-over-coat-cuff","gloves","cuff","under-sleeve","gauntlet-over-cuff"]
  ]) {
    const a = byId(innerRule), b = byId(outerRule);
    assert(a && b);
    assert.equal(a.inner, b.outer);
    assert.equal(a.outer, b.inner);
    assert.equal(a.when[cl][mode], left);
    assert.equal(b.when[cl][mode], right);
  }
});

test("outerwear rules preserve provisional layering without asserting a fit pass", () => {
  for (const id of ["top-under-coat","corset-under-coat","dress-under-coat"]) {
    assert.equal(byId(id).outer, "coat");
    assert.equal(byId(id).outcome, "needs-fitting");
  }
  assert.deepEqual(original.classes.coat.modes.closure, { choices: ["open", "closed"], default: "open" });
  assert.equal(original.classes.dress.modes.silhouette.default, "gown");
});

test("blocked conflict cases remain blocked", () => {
  for (const id of ["gown-conflicts-pants", "top-conflicts-gown", "direct-corset-conflicts-top",
    "armor-conflicts-coat", "shoe-vs-boot"]) assert.equal(byId(id).outcome, "blocked");
});

test("missing or unknown fields, IDs, modes, regions and classes fail closed", () => {
  const a = copy(); a.extra = "undocumented"; assert(errors(a,"UNKNOWN_FIELD").length);
  const b = copy(); b.relationships[0].id = b.relationships[1].id; assert(errors(b,"DUPLICATE_ID").length);
  const c = copy(); c.relationships[0].inner = "alien-fabric"; assert(errors(c,"UNKNOWN_CLASS").length);
  const d = copy(); d.relationships[0].regions.push("tentacle"); assert(errors(d,"UNKNOWN_REGION").length);
  const e = copy(); e.classes.coat.modes.closure.default = "auto-explode"; assert(errors(e,"MODE_DEFAULT").length);
  const f = copy(); f.schemaVersion = 2; assert(errors(f,"SCHEMA_VERSION").length);
  const g = copy(); g.relationships[0].when = { coat: { closure: "open" } }; assert(errors(g,"MODE_SCOPE").length);
  const h = copy(); h.relationships[0].when = { top: { nonexistent: "open" } }; assert(errors(h,"UNKNOWN_MODE").length);
  const i = copy(); i.relationships.find(x => x.id === "belt-over-coat").when.belt.placement = "floating";
  assert(errors(i,"MODE_CHOICE").length);
});

test("simultaneously active reversals and multi-class ordering cycles are detected", () => {
  const a = copy();
  a.relationships.push({
    id:"bad-reversal", inner:"boot", outer:"pants", regions:["leftCalf"],
    when:{boot:{cuff:"pants-tucked"}}, outcome:"needs-fitting",
    reason:"Contradicts the selected boot cuff orientation."
  });
  assert(errors(a,"AMBIGUOUS_PAIR").length || errors(a,"ORDER_CYCLE").length);
  const b = copy();
  b.relationships.push({
    id:"bad-cycle", inner:"coat", outer:"underwear", regions:["torsoFront"],
    outcome:"needs-fitting", reason:"Creates a cycle through shirt and outerwear."
  });
  assert(errors(b,"ORDER_CYCLE").length);
});

test("item overrides allow reviewed specifications, never implicit acceptance", () => {
  const good = copy();
  good.itemOverrides.push({
    garmentId:"test-coat", classId:"coat", reason:"Test-only mode configuration awaiting fitted asset.",
    regions:["torsoFront"], modeDefaults:{closure:"closed"}, protectedFeatures:["lapels"],
    pairPolicies:[{otherGarmentId:"test-shirt", regions:["torsoFront"], position:"outside",
      outcome:"needs-fitting", reason:"Requires a physical shirt and coat fit test."}]
  });
  assert.equal(validateLayerRules(good).valid, true);
  const a = structuredClone(good); a.itemOverrides.push(a.itemOverrides[0]); assert(errors(a,"DUPLICATE_ID").length);
  const b = structuredClone(good); b.itemOverrides[0].modeDefaults.closure = "zipper"; assert(errors(b,"MODE_CHOICE").length);
  const c = structuredClone(good); c.itemOverrides[0].pairPolicies[0].position = "none"; assert(errors(c,"POSITION").length);
  const d = structuredClone(good); d.itemOverrides[0].pairPolicies[0].otherGarmentId = "test-coat";
  assert(errors(d,"SELF_RELATION").length);
});

test("dependent garment lifecycle never deletes an explicit saved selection", () => {
  const skirt = original.dependencies.find(x => x.id === "petticoat-follows-skirt");
  const gown = original.dependencies.find(x => x.id === "petticoat-with-gown");
  assert.equal(skirt.parent, "skirt");
  assert.equal(skirt.activation, "derived");
  assert.equal(skirt.onParentAbsent, "remove-derived-only");
  assert.equal(gown.activation, "explicit");
  assert.equal(gown.onParentAbsent, "deactivate-preserve-selection");
  const wrong = copy();
  wrong.dependencies[1].onParentAbsent = "remove-derived-only";
  assert(errors(wrong, "DEPENDENCY_POLICY").length);
  const unknown = copy();
  unknown.dependencies[0].child = "not-a-garment";
  assert(errors(unknown, "UNKNOWN_CLASS").length);
  const duplicate = copy();
  duplicate.dependencies.push({ ...duplicate.dependencies[0] });
  assert(errors(duplicate, "DUPLICATE_ID").length);
});

test("manifest validator is deterministic, does not mutate input or saved garment IDs", () => {
  const input = copy(), before = JSON.stringify(input);
  const saved = Object.freeze({garments:Object.freeze({top:"top-03",skirt:"gothic-skirt-02",coat:"coat-01"})});
  const s = JSON.stringify(saved);
  assert.deepEqual(validateLayerRules(input),validateLayerRules(input));
  assert.equal(JSON.stringify(input),before);
  assert.equal(JSON.stringify(saved),s);
});
