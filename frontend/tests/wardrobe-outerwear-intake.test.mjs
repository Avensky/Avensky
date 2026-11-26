import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const from = file => JSON.parse(readFileSync(new URL(file,import.meta.url),"utf8"));
const manifest = from("../../packages/wardrobe-catalog/outerwear-candidates.json");
const published = from("../../packages/wardrobe-catalog/character-garments.json");
const discovered = from("../../packages/wardrobe-catalog/discovered-wardrobe-garments.json");

test("W-07 includes exactly three unapproved private outerwear candidate IDs",() => {
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.candidates.length,3);
  assert.deepEqual(manifest.candidates.map(x=>x.id),
    ["clo-coat-01","clo-jacket-01","clo-jacket-02"]);
  const ids=new Set(manifest.candidates.map(x=>x.id));
  assert.equal(ids.size,3);
  const current=new Set([...published,...discovered].map(x=>x.id));
  for(const id of ids)assert(!current.has(id),"candidate cannot appear as an equip-ready garment: "+id);
  assert(manifest.importPolicy.publish===false && manifest.importPolicy.autoDiscover===false &&
    manifest.importPolicy.equip===false);
  assert.equal(manifest.importPolicy.retiredCatalogIdNotReused,"coat-01");
  assert.match(manifest.sourceHandling,/Private inputs only/);
});

test("W-07 uploaded source mapping is deterministic and fail-closed",() => {
  const expected=[
    ["z-h_Coat 01-THIN WELD.fbx",166620,86118,3],
    ["z-h_Jacket 01-THIN WELD.fbx",124942,66867,12],
    ["z-h_Jacket 02-THIN WELD.fbx",175554,90462,4]
  ];
  for(const [i,item] of manifest.candidates.entries()){
    assert.equal(item.status,"intake-only");
    assert.equal(item.category,"outerwear");
    assert.equal(item.slot,"coat");
    assert.equal(item.piece,"coat");
    assert.equal(item.source.preferred.name,expected[i][0]);
    assert.equal(item.source.preferred.triangles,expected[i][1]);
    assert.equal(item.source.preferred.controlPoints,expected[i][2]);
    assert.equal(item.materialSlots,expected[i][3]);
    assert.match(item.source.preferred.sha256,/^[0-9a-f]{64}$/);
    assert(item.source.preferred.bytes>0);
    assert.equal(item.source.alternates.length,2);
    assert.match(item.source.normalMap,/normal\.png$/);
    assert.match(item.source.cloProject,/\.zprj$/);
    assert.equal(item.approxBoundsMeters.length,3);
    assert(item.approxBoundsMeters.every(v=>v>0));
    assert(item.unverified.length>0);
    assert(!("url" in item) && !("mobileUrl" in item));
  }
});

test("W-07 mode intents never imply actual closure geometry or commercial rights",() => {
  const [coat,cropped,blazer]=manifest.candidates;
  assert.equal(coat.authoredClosure,"open");
  assert.equal(cropped.authoredClosure,"open");
  assert.match(blazer.authoredClosure,/button/);
  assert.deepEqual(manifest.candidates.map(x=>x.trialPriority),[1,2,3]);
  for(const x of manifest.candidates){
    assert(x.laterLayerTrials.some(set=>set.includes("corset")));
    assert(x.laterLayerTrials.some(set=>set.includes("gown")));
    assert.equal(x.firstLayerTrial.at(-1),"coat");
    assert(!("licensed" in x) && !("approved" in x));
  }
});
