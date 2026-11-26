import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  resolveWardrobeLayers, classifyWardrobeCatalogItem, outfitSignature
} from "../../packages/wardrobe-catalog/resolve-wardrobe-layers.mjs";

const rules = JSON.parse(readFileSync(new URL("../../packages/wardrobe-catalog/layer-rules.json", import.meta.url), "utf8"));
const sample = (id, classId, modes = {}, origin = "explicit") =>
  ({id, classId, modes, origin, sourceRevision: id + "@revision-1", available: true, rigCompatible: true});
const input = (equipped, other = {}) => ({
  equipped, bodyProfileId: "test-body-v1", tier: "garage", poseId: "idle", ...other
});
const run = (entries, other = {}, manifest = rules) => resolveWardrobeLayers(input(entries, other), manifest);
const inRegion = (report, region) => report.regions.find(r => r.region === region);
const between = (report, a, b, region) =>
  report.pairs.find(p => p.region === region && p.garmentIds.includes(a) && p.garmentIds.includes(b));
const problems = (report, code) => report.issues.filter(i => i.code === code);
function approvalsFor(report, entries, other = {}) {
  const byId = Object.fromEntries(entries.map(x => [x.id, x]));
  const effective = Object.fromEntries(report.membership.map(x => [x.id, x.modes]));
  const grouped = new Map();
  for (const p of report.pairs.filter(x => x.status === "needs-fitting" && x.inner && x.outer)) {
    const key = p.garmentIds.join("|");
    const existing = grouped.get(key) ?? {ids:p.garmentIds, regions:[]};
    existing.regions.push(p.region);
    grouped.set(key, existing);
  }
  return [...grouped.values()].map(({ids,regions}) => ({
    garmentIds:ids, regions, bodyProfileId:other.bodyProfileId ?? "test-body-v1",
    tier:other.tier ?? "garage", sourceRevisions:Object.fromEntries(ids.map(id => [id, byId[id].sourceRevision])),
    modes:Object.fromEntries(ids.map(id => [id,effective[id]])),
    reviewed:true, status:"passed", reportId:"fictional-test-report:" + ids.join("-")
  }));
}
const hero=[sample("top-03","top"),sample("gothic-laced-bodice","corset",{"body-fit":"over-top"}),
  sample("sample-coat","coat",{"closure":"open"})];

test("W-04 top + corset + coat: deterministic torso order, saved IDs and pending fit", () => {
  const r=run(hero);
  assert.equal(r.status,"needs-fitting");
  assert.deepEqual(inRegion(r,"torsoFront").order,["top-03","gothic-laced-bodice","sample-coat"]);
  assert.deepEqual(r.equipped.map(x=>x.id),["gothic-laced-bodice","sample-coat","top-03"]);
  assert.deepEqual(r.activeIds,[]);
  assert.equal(between(r,"top-03","sample-coat","torsoFront").status,"needs-fitting");
  assert(problems(r,"PAIR_FIT_UNVERIFIED").length);
  assert(r.visibility.every(x=>x.state==="unverified"));
});

test("all pair/region mode/source-profile-specific fit evidence admits active layer graph", () => {
  const preliminary=run(hero);
  const reports=approvalsFor(preliminary,hero);
  const approved=run(hero,{fitEvidence:reports});
  assert.equal(approved.status,"allowed");
  assert.deepEqual(approved.activeIds,["gothic-laced-bodice","sample-coat","top-03"]);
  assert(approved.pairs.every(x=>x.status==="allowed"));
  assert(inRegion(approved,"torsoFront").edges.every(x=>x.status==="allowed"));
  assert(approved.visibility.every(x=>x.state==="unverified"),
    "Geometry fit evidence alone must not claim a visibility-tested mesh");
});

test("open/closed coat changes only proposed front exposure; never drops a saved garment", () => {
  const open=run(hero), closed=run(hero.map(x=>x.classId==="coat"?{...x,modes:{closure:"closed"}}:x));
  assert.deepEqual(open.equipped.map(x=>x.id),closed.equipped.map(x=>x.id));
  const front=x=>x.occlusionIntents.find(h=>h.garmentId==="top-03"&&h.region==="torsoFront");
  const back=x=>x.occlusionIntents.find(h=>h.garmentId==="top-03"&&h.region==="torsoBack");
  assert.equal(front(open).intent,"expose-opening");
  assert.equal(front(closed).intent,"may-cover");
  assert.equal(back(open).intent,"may-cover","Open coat can still cover the back");
  assert.deepEqual(run(hero.filter(x=>x.classId!=="coat")).equipped.map(x=>x.id),
    ["gothic-laced-bodice","top-03"]);
});

test("evidence from another mode, source revision, profile or tier never approves a pair", () => {
  const base=run(hero), reports=approvalsFor(base,hero);
  assert.equal(run(hero,{fitEvidence:reports}).status,"allowed");
  assert.equal(run(hero.map(x=>x.classId==="coat"?{...x,modes:{closure:"closed"}}:x),
    {fitEvidence:reports}).status,"needs-fitting");
  assert.equal(run(hero.map(x=>x.classId==="top"?{...x,sourceRevision:"new-file"}:x),
    {fitEvidence:reports}).status,"needs-fitting");
  assert.equal(run(hero,{fitEvidence:reports,tier:"mobile"}).status,"needs-fitting");
  assert.equal(run(hero,{fitEvidence:reports,bodyProfileId:"second-body"}).status,"needs-fitting");
  const stale=structuredClone(reports); stale[0].reviewed=false;
  assert.equal(run(hero,{fitEvidence:stale}).status,"needs-fitting");
  const missingMode=structuredClone(reports); delete missingMode[0].modes;
  assert.equal(run(hero,{fitEvidence:missingMode}).status,"needs-fitting");
});

test("gown + coat is provisional, gown + pants conflicts, tunic + pants needs review", () => {
  const gown=sample("gown-1","dress");
  const coat=sample("coat-1","coat");
  assert.equal(run([gown,coat]).status,"needs-fitting");
  assert.equal(between(run([gown,coat]),"gown-1","coat-1","torsoFront").outer,"coat-1");
  const pants=sample("pants-1","pants");
  const blocked=run([gown,pants]);
  assert.equal(blocked.status,"blocked");
  assert(problems(blocked,"INCOMPATIBLE_CLASS").length);
  assert.deepEqual(blocked.equipped.map(x=>x.id),["gown-1","pants-1"]);
  const tunic=run([{...gown,modes:{silhouette:"tunic"}},pants]);
  assert.equal(tunic.status,"needs-fitting");
  assert.equal(between(tunic,"gown-1","pants-1","hips").inner,"pants-1");
});

test("pants inside boots versus outside boots reverses only cuff region ordering", () => {
  const pants=sample("pants-1","pants"), boot=sample("boots-1","boot");
  const over=run([pants,boot]), tucked=run([pants,{...boot,modes:{cuff:"pants-tucked"}}]);
  assert.equal(between(over,"pants-1","boots-1","leftCalf").inner,"boots-1");
  assert.equal(between(tucked,"pants-1","boots-1","leftCalf").inner,"pants-1");
  assert.equal(over.status,"needs-fitting"); assert.equal(tucked.status,"needs-fitting");
  assert.equal(run([sample("shoe-1","shoe"),boot]).status,"blocked");
});

test("belt, scarf and glove modes reverse order when intentionally selected", () => {
  const coat=sample("coat-1","coat");
  const combos=[
    ["belt","belt-1","placement","under-coat","over-coat","waistFront"],
    ["gloves","gloves-1","cuff","under-sleeve","gauntlet-over-cuff","leftForearm"],
    ["scarf","scarf-1","placement","tucked","outside","neck"],
  ];
  for (const [cls,id,key,inside,outside,region] of combos) {
    const a=run([coat,sample(id,cls,{[key]:inside})]);
    const b=run([coat,sample(id,cls,{[key]:outside})]);
    assert.equal(between(a,id,"coat-1",region).inner,id);
    assert.equal(between(b,id,"coat-1",region).outer,id);
  }
});

test("missing relation is pending rather than auto-approved or blindly ordered", () => {
  const unknown=run([sample("shirt","top"),sample("trousers","pants")]);
  assert.equal(unknown.status,"needs-fitting");
  assert(problems(unknown,"UNKNOWN_RELATION").length);
  assert.deepEqual(unknown.activeIds,[]);
  const regional=inRegion(unknown,"waistFront");
  assert(regional.order.includes("shirt")&&regional.order.includes("trousers"));
  assert(!regional.edges.length,"No invented order edge for unknown relationship");
});

test("explicit and derived petticoats are saved but inactive without a viable parent", () => {
  const p=sample("petticoat-1","petticoat",{},"explicit");
  const missing=run([p]);
  assert.equal(missing.dependencies[0].active,false);
  assert.equal(missing.dependencies[0].action,"deactivate-preserve-selection");
  assert.equal(missing.equipped[0].id,p.id);
  assert(problems(missing,"DEPENDENCY_INACTIVE").length);
  const available=run([p,sample("skirt-1","skirt")]);
  assert.equal(available.dependencies[0].active,true);
  const derived=run([sample("underlayer-1","petticoat",{},"derived")]);
  assert.equal(derived.dependencies[0].action,"remove-derived-only");
  const two=run([p,sample("skirt-1","skirt"),sample("dress-1","dress")]);
  assert.deepEqual(two.dependencies[0].parents,["dress-1","skirt-1"]);
});

test("item-specific exception to class block remains pending fit, cannot auto-approve", () => {
  const manifest=structuredClone(rules);
  manifest.itemOverrides.push({
    garmentId:"armor-1",classId:"armor",
    reason:"Purpose-built armor model is a candidate for coat clearance",
    pairPolicies:[{
      otherGarmentId:"coat-1",regions:["torsoFront","torsoBack"],
      position:"inside",outcome:"needs-fitting",
      reason:"Requires purpose-built armor and coat fit measurements"
    }]
  });
  const r=run([sample("armor-1","armor"),sample("coat-1","coat")],{},manifest);
  assert.equal(between(r,"armor-1","coat-1","torsoFront").status,"needs-fitting");
  assert.equal(between(r,"armor-1","coat-1","torsoBack").inner,"armor-1");
  assert.equal(between(r,"armor-1","coat-1","leftShoulder").status,"blocked",
    "Unreviewed shoulder geometry stays blocked");
  assert.equal(r.status,"blocked");
});

test("mode or rig errors, duplicate IDs, missing assets and unsupported stacks fail closed", () => {
  const invalidMode=run([sample("bad-coat","coat",{closure:"teleport"})]);
  assert.equal(invalidMode.status,"blocked"); assert(problems(invalidMode,"INVALID_MODE").length);
  const missing=run([{...sample("missing-coat","coat"),available:false}]);
  assert(problems(missing,"MISSING_ASSET").length);
  const wrongRig=run([{...sample("alien-hood","hood"),rigCompatible:false}]);
  assert(problems(wrongRig,"RIG_MISMATCH").length);
  const duplicate=run([sample("duplicated","top"),sample("duplicated","top")]);
  assert(problems(duplicate,"DUPLICATE_GARMENT").length);
  const sameClass=run([sample("top-1","top"),sample("top-2","top")]);
  assert.equal(sameClass.status,"blocked");
  assert(problems(sameClass,"UNSUPPORTED_STACK").length);
});

test("per-garment visibility report requires the matching whole outfit, mode and pose", () => {
  const r=run(hero);
  const m=r.membership.find(x=>x.id==="top-03");
  const record={
    garmentId:m.id,region:"torsoFront",visible:true,reviewed:true,
    reportId:"sample-image-001",sourceRevision:m.sourceRevision,
    modes:m.modes,bodyProfileId:"test-body-v1",tier:"garage",poseId:"idle",
    outfitSignature:outfitSignature(r.membership)
  };
  assert.equal(run(hero,{visibilityEvidence:[record]}).visibility.find(v=>
    v.garmentId==="top-03"&&v.region==="torsoFront").state,"visible");
  const closed=hero.map(x=>x.classId==="coat"?{...x,modes:{closure:"closed"}}:x);
  assert.equal(run(closed,{visibilityEvidence:[record]}).visibility.find(v=>
    v.garmentId==="top-03"&&v.region==="torsoFront").state,"unverified");
  assert.equal(run(hero,{visibilityEvidence:[record],poseId:"walking"}).visibility.find(v=>
    v.garmentId==="top-03"&&v.region==="torsoFront").state,"unverified");
});

test("same outfit permuted, frozen, or re-resolved yields stable output without mutation", () => {
  const outfit={savedAppearance:{item_colors:{"top-03:shirt":{color:"#442211"}}},
    equipped:hero.map(x=>({...x,modes:Object.freeze({...x.modes})}))};
  outfit.equipped.forEach(Object.freeze); Object.freeze(outfit.equipped);
  Object.freeze(outfit.savedAppearance.item_colors["top-03:shirt"]);
  const first=resolveWardrobeLayers(outfit,rules);
  const reversed=resolveWardrobeLayers({...outfit,equipped:[...outfit.equipped].reverse()},rules);
  assert.deepEqual(first,reversed);
  assert.deepEqual(first,resolveWardrobeLayers(outfit,rules));
  assert.equal(outfit.savedAppearance.item_colors["top-03:shirt"].color,"#442211");
  assert.equal(outfit.equipped[0].id,"top-03");
});

test("catalog mapping respects actual piece, not misleading slot or name", () => {
  assert.equal(classifyWardrobeCatalogItem({id:"top-03",slot:"top",piece:"shirt"}),"top");
  assert.equal(classifyWardrobeCatalogItem({id:"armor-01",slot:"top",piece:"armor"}),"armor");
  assert.equal(classifyWardrobeCatalogItem({id:"medieval-08",slot:"dress",piece:"dress"}),"dress");
  assert.equal(classifyWardrobeCatalogItem({id:"hood-01",slot:"hat",piece:"hat"}),"hood");
  assert.equal(classifyWardrobeCatalogItem({id:"hat-01",slot:"hat",piece:"hat"}),null,
    "W-04 must not guess an unmodeled hat class");
});
