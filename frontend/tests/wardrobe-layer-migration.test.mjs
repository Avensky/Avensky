import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyWardrobeCatalogItem} from "../../packages/wardrobe-catalog/resolve-wardrobe-layers.mjs";
import {migrateLegacyOutfit,revertLayerMigration,validateLegacyLayerSidecar,
  withLegacyLayerMode,plannedLayerCandidates} from "../../packages/wardrobe-catalog/migrate-legacy-wardrobe.mjs";

const fixture=JSON.parse(readFileSync(new URL("./fixtures/wardrobe-layer-save-v1.json",import.meta.url),"utf8"));
const catalog=[
 ...JSON.parse(readFileSync(new URL("../../packages/wardrobe-catalog/character-garments.json",import.meta.url),"utf8")),
 ...JSON.parse(readFileSync(new URL("../../packages/wardrobe-catalog/character-village-pieces.json",import.meta.url),"utf8")),
];
const rules=JSON.parse(readFileSync(new URL("../../packages/wardrobe-catalog/layer-rules.json",import.meta.url),"utf8"));
const opts={catalog,rules};
const withError=code=>error=>{assert.equal(error.code,code);return true;};

test("legacy snapshot migrates opt-in only and reverts without losing saved colors",()=>{
 const before=JSON.stringify(fixture.legacy);
 const migrated=migrateLegacyOutfit(fixture.legacy,opts);
 assert.equal(JSON.stringify(fixture.legacy),before);
 assert.deepEqual(revertLayerMigration(migrated.choice),fixture.legacy);
 assert.deepEqual(migrated.choice.wardrobeLayers.entries.map(x=>x.source+":"+x.slot),[
  "garments:bow","garments:skirt","garments:socks","garments:top",
  "garments:underskirt","wardrobe:corset","wardrobeTrial:corset"
 ]);
 assert.deepEqual(migrated.choice.appearance.item_colors,fixture.legacy.appearance.item_colors);
 assert.deepEqual(migrated.choice.removedClothing,fixture.legacy.removedClothing);
 assert.equal(migrated.selections.find(x=>x.source==="wardrobe").sourceStatus,"suspended");
 assert.equal(migrated.selections.find(x=>x.source==="wardrobeTrial").sourceStatus,"suspended");
 assert.equal(migrated.selections.find(x=>x.slot==="skirt").sourceStatus,"suspended");
 assert(migrated.diagnostics.some(x=>x.id==="bowtie-03"&&x.code==="UNMAPPED_CLASS"));
});

test("over-top intent is stored separately without changing the old corset cut or color",()=>{
 const updated=withLegacyLayerMode(fixture.legacy,{source:"wardrobeTrial",slot:"corset"},"body-fit","over-top",opts);
 assert.deepEqual(updated,fixture.layered);
 assert.deepEqual(revertLayerMigration(updated),fixture.legacy);
 assert.equal(updated.wardrobeTrial.waist,"over");
 assert.equal(migrateLegacyOutfit(updated,opts).selections.find(x=>x.source==="wardrobeTrial").sourceStatus,"candidate");
 assert.equal(migrateLegacyOutfit(updated,opts).selections.find(x=>x.source==="wardrobe").sourceStatus,"suspended");
});

test("repeated migrations of already-versioned saves are stable and preserve existing IDs",()=>{
 const twice=migrateLegacyOutfit(migrateLegacyOutfit(fixture.layered,opts).choice,opts);
 assert.deepEqual(twice.choice,fixture.layered);
 assert.equal(twice.selections.find(x=>x.slot==="top").classId,"top");
 assert.equal(twice.selections.find(x=>x.slot==="underskirt").classId,"petticoat");
 assert.equal(classifyWardrobeCatalogItem(catalog.find(x=>x.id==="armor-01")),"armor");
 assert.deepEqual(revertLayerMigration(fixture.layered),fixture.legacy);
});

test("mode edit does not silently equip new garments or override legacy waist",()=>{
 const before=JSON.stringify(fixture.legacy);
 assert.throws(()=>withLegacyLayerMode(fixture.legacy,{source:"garments",slot:"coat"},"closure","open",opts),withError("UNKNOWN_SELECTION"));
 assert.throws(()=>withLegacyLayerMode(fixture.legacy,{source:"garments",slot:"top"},"closure","closed",opts),withError("INVALID_LAYER_MODE"));
 assert.throws(()=>withLegacyLayerMode(fixture.legacy,{source:"wardrobeTrial",slot:"corset"},"waist","tucked",opts),withError("WAIST_MISMATCH"));
 assert.throws(()=>withLegacyLayerMode(fixture.legacy,{source:"garments",slot:"bow"},"closure","open",opts),withError("UNMAPPED_LAYER_CLASS"));
 assert.equal(JSON.stringify(fixture.legacy),before);
});

test("unknown version, stale IDs, duplicate entries and illegal modes fail closed",()=>{
 const version=structuredClone(fixture.layered);version.wardrobeLayers.schemaVersion=2;
 assert.throws(()=>migrateLegacyOutfit(version,opts),withError("INVALID_LAYER_SAVE"));
 const stale=structuredClone(fixture.layered);stale.wardrobeLayers.entries[0].id="unselected";
 assert.throws(()=>validateLegacyLayerSidecar(stale,opts),withError("STALE_LAYER_ENTRY"));
 const dup=structuredClone(fixture.layered);dup.wardrobeLayers.entries.push(dup.wardrobeLayers.entries[0]);
 assert.throws(()=>validateLegacyLayerSidecar(dup,opts),withError("DUPLICATE_LAYER_ENTRY"));
 const mode=structuredClone(fixture.layered);mode.wardrobeLayers.entries.at(-1).modes["body-fit"]="invisible";
 assert.throws(()=>validateLegacyLayerSidecar(mode,opts),withError("INVALID_LAYER_MODE"));
 const waist=structuredClone(fixture.layered);waist.wardrobeLayers.entries.at(-2).modes.waist="over";
 assert.throws(()=>validateLegacyLayerSidecar(waist,opts),withError("WAIST_MISMATCH"));
 const extra=structuredClone(fixture.layered);extra.wardrobeLayers.extra=true;
 assert.throws(()=>validateLegacyLayerSidecar(extra,opts),withError("INVALID_LAYER_SAVE"));
});

test("planner preserves dormant selections but never claims to render or fit them",()=>{
 const plan=plannedLayerCandidates(fixture.layered,opts);
 assert.equal(plan.rendererIntegrated,false);
 assert(plan.equipped.some(x=>x.id==="gothic-04"&&x.classId==="corset"));
 assert(plan.suspended.some(x=>x.id==="gothic-05"));
 assert(!plan.equipped.some(x=>x.id==="gothic-skirt-04"));
 assert(!plan.equipped.some(x=>x.id==="bowtie-03"));
 assert.equal(plan.equipped.find(x=>x.id==="top-02").modes["body-fit"],undefined);
});

test("future supported coat can carry closed mode without replacing saved top or corset",()=>{
 const extended=[...catalog,{id:"future-coat",slot:"coat",piece:"coat",retired:false}];
 const choice={id:"mara-vega",outfit:"shop-crew",garments:{top:"top-03",coat:"future-coat"},
  wardrobeTrial:{set:"gothic-04",shirt:"none",waist:"over"}};
 const changed=withLegacyLayerMode(choice,{source:"garments",slot:"coat"},"closure","closed",{catalog:extended,rules});
 assert.equal(changed.garments.top,"top-03");
 assert.equal(changed.wardrobeTrial.set,"gothic-04");
 assert.equal(changed.wardrobeLayers.entries.find(x=>x.slot==="coat").modes.closure,"closed");
 assert.deepEqual(revertLayerMigration(changed),choice);
 assert.equal(plannedLayerCandidates(changed,{catalog:extended,rules}).rendererIntegrated,false);
});
