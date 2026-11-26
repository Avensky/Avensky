import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWardrobeLayerPreview } from "../../packages/wardrobe-catalog/wardrobe-layer-preview.mjs";
import { withLegacyLayerMode, revertLayerMigration } from "../../packages/wardrobe-catalog/migrate-legacy-wardrobe.mjs";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const fixture = read("./fixtures/wardrobe-layer-save-v1.json");
const rules = read("../../packages/wardrobe-catalog/layer-rules.json");
const catalog = [...read("../../packages/wardrobe-catalog/character-garments.json"),
  ...read("../../packages/wardrobe-catalog/character-village-pieces.json")];
const config = {catalog,rules};
const preview = choice => buildWardrobeLayerPreview(choice,config);

test("W-06 pure read-only preview preserves all legacy IDs, removals and dye keys", () => {
  const choice = structuredClone(fixture.legacy);
  const raw = JSON.stringify(choice);
  const plan = preview(choice);
  assert.equal(JSON.stringify(choice), raw, "inspecting must never rewrite a saved look");
  assert.equal(plan.baseOutfitId, "shop-crew");
  assert.equal(plan.saved.length, 7);
  assert.deepEqual(plan.saved.map(x => x.id), [
    "bowtie-03","gothic-skirt-04","socks-01","top-02",
    "village-petticoat","gothic-05","gothic-04",
  ]);
  assert.deepEqual(plan.removedClothing, choice.removedClothing);
  assert.equal(plan.saved.find(x => x.id === "gothic-skirt-04").status,"suspended");
  assert.equal(plan.saved.find(x => x.id === "gothic-05").status,"suspended");
  assert.equal(plan.saved.find(x => x.id === "gothic-04").status,"suspended");
  assert.equal(plan.rendererIntegrated,false);
  assert.equal(plan.audited,false);
  assert(!plan.saved.some(x => x.reviewStatus === "allowed"),
    "An unreviewed pair must not be labelled as physically approved");
});

test("W-06 updated over-top corset mode is proposed, not automatically fitted or visible", () => {
  const raw = JSON.stringify(fixture.layered);
  const plan = preview(fixture.layered);
  assert.equal(JSON.stringify(fixture.layered),raw);
  const top = plan.saved.find(x => x.id === "top-02");
  const corset = plan.saved.find(x => x.id === "gothic-04");
  assert.equal(corset.status,"candidate");
  assert.equal(corset.modes["body-fit"],"over-top");
  assert.equal(top.status,"candidate");
  assert.equal(plan.status,"needs-fitting");
  assert(plan.issues.some(x => x.code === "PAIR_FIT_UNVERIFIED" &&
    x.garmentIds.includes("gothic-04") && x.garmentIds.includes("top-02")));
  assert(plan.regions.some(x => x.orderedIds.includes("gothic-04") && x.orderedIds.includes("top-02")));
  assert(plan.saved.every(x => x.reviewStatus !== "allowed"));
});

test("W-06 open coat proposes front exposure but never modifies the original outfit", () => {
  const localCatalog=[...catalog,{id:"candidate-coat",label:"Candidate Coat",slot:"coat",piece:"coat",retired:false}];
  const local={catalog:localCatalog,rules};
  const old={id:"mara-vega",outfit:"shop-crew",garments:{top:"top-02",coat:"candidate-coat"},
    appearance:{item_colors:{"top-02:shirt":{color:"#112233"}}}};
  const opened=withLegacyLayerMode(old,{source:"garments",slot:"coat"},"closure","open",local);
  const closed=withLegacyLayerMode(old,{source:"garments",slot:"coat"},"closure","closed",local);
  const a=buildWardrobeLayerPreview(opened,local);
  const c=buildWardrobeLayerPreview(closed,local);
  assert.equal(a.status,"needs-fitting");
  assert.equal(c.status,"needs-fitting");
  assert.deepEqual(a.saved.map(x=>x.id),c.saved.map(x=>x.id));
  assert.deepEqual(revertLayerMigration(opened),old);
  assert.deepEqual(revertLayerMigration(closed),old);
  assert(a.occlusionIntents.some(x=>x.garmentId==="top-02" && x.intent==="expose-opening"));
  assert(c.occlusionIntents.some(x=>x.garmentId==="top-02" && x.intent==="may-cover"));
  assert.equal(a.audited,false);
  assert.equal(c.rendererIntegrated,false);
});

test("W-06 retired coat and unsupported decorative selections remain saved but not activated", () => {
  const choice={id:"mara-vega",outfit:"shop-crew",garments:{
    coat:"coat-01",bow:"bowtie-03",top:"top-02",
  }};
  const result=preview(choice);
  assert.equal(result.saved.find(x=>x.id==="coat-01").status,"retired");
  assert.equal(result.saved.find(x=>x.id==="bowtie-03").status,"unmapped");
  assert(result.saved.find(x=>x.id==="top-02").status==="candidate");
  assert(result.issues.every(x=>!x.garmentIds.includes("coat-01")),
    "Retired coat must not participate in a falsely approved outfit graph");
  assert.deepEqual(choice.garments,{coat:"coat-01",bow:"bowtie-03",top:"top-02"});
});

test("W-06 invalid sidecar is shown as blocked while original garment IDs remain visible", () => {
  const invalid=structuredClone(fixture.layered);
  invalid.wardrobeLayers.schemaVersion=99;
  const before=JSON.stringify(invalid);
  const plan=preview(invalid);
  assert.equal(plan.status,"blocked");
  assert.equal(plan.error!==null,true);
  assert(plan.issues.some(x=>x.code==="INVALID_LAYER_SAVE"));
  assert.equal(plan.saved.length,7);
  assert.equal(plan.saved.find(x=>x.source==="wardrobeTrial").id,"gothic-04");
  assert.equal(JSON.stringify(invalid),before);
});

test("W-06 a bare legacy character has no inferred garment approvals", () => {
  const choice={id:"jules-okafor",outfit:"night-run"};
  const result=preview(choice);
  assert.equal(result.baseOutfitId,"night-run");
  assert.equal(result.saved.length,0);
  assert.equal(result.status,"unverified");
  assert.equal(result.regions.length,0);
  assert.equal(result.audited,false);
  assert.equal(result.rendererIntegrated,false);
});
