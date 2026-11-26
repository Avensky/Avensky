import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const from = path=>JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));
const recipe=from("../../packages/wardrobe-catalog/garment-fit-recipes.v1.json");
const candidates=from("../../packages/wardrobe-catalog/outerwear-candidates.json");

test("W-07 recipe stages are explicit, ordered and blocked without rig/body proof",()=>{
 assert.equal(recipe.schemaVersion,1);
 assert.match(recipe.status,/proposed/);
 assert.equal(recipe.target.requiredRigJointCount,88);
 assert.equal(recipe.target.requireRealAsset,true);
 assert.equal(recipe.target.bodyMeshName,"BODY_WARDROBE");
 assert(recipe.stageOrder.indexOf("verify-donor")<recipe.stageOrder.indexOf("transfer-skin-weights"));
 assert(recipe.stageOrder.indexOf("transfer-skin-weights")<recipe.stageOrder.indexOf("fit-by-region"));
 assert(recipe.stageOrder.indexOf("test-layer-stacks")<recipe.stageOrder.indexOf("pose-collision-qa"));
 assert(recipe.stageOrder.indexOf("pose-collision-qa")<recipe.stageOrder.indexOf("human-acceptance"));
 assert.equal(new Set(recipe.stageOrder).size,recipe.stageOrder.length);
 assert.deepEqual(Object.keys(recipe.stages).sort(),[...recipe.stageOrder].sort());
 assert.equal(recipe.stages["transfer-skin-weights"].noSkinningFallback.startsWith("block"),true);
 assert.equal(recipe.stages["pose-collision-qa"].missingPose,"not-tested-not-passed");
 assert.equal(recipe.stages["fit-by-region"].noGlobalShrinkwrap,true);
 assert.equal(recipe.stages["human-acceptance"].noImplicitApproval,true);
});

test("W-07 corset protects structure while allowing fabric-only adjustments",()=>{
 const c=recipe.garmentClasses.corset;
 assert(c.anchorProfiles.includes("bust")&&c.anchorProfiles.includes("underbust"));
 assert(c.anchorProfiles.includes("waist"));
 assert(c.constrained.includes("cups"));
 assert(c.locked.includes("eyelets")&&c.locked.includes("rigidBoning"));
 assert(c.followParent.includes("lacing"));
 assert(c.priority.some(x=>x.includes("cup volume")));
 assert(recipe.optimization.hardStops.includes("stretchedLockedHardware"));
 assert(recipe.optimization.reuseAcceptedCorrections.includes("source mesh hash"));
});

test("W-07 outerwear fits over composite underlayers, not directly through them",()=>{
 const x=recipe.garmentClasses.outerwear;
 assert(x.fittedAgainst.includes("underlayer shell"));
 assert(x.fittedAgainst.includes("NEVER body alone"));
 assert(x.caution.includes("openFrontUnderlayerVisibility"));
 assert(x.caution.includes("cuffsOverInnerSleeves"));
 assert(x.locked.includes("zipperTeeth"));
 assert(recipe.stages["test-layer-stacks"].unknownPairStatus==="needs-fitting");
});

test("Material-only edits cannot invalidate geometry; changed thickness and topology must",()=>{
 const {cacheContract:c,stages:s}=recipe;
 assert(s["material-variant-preview"].changesGeometry===false);
 for(const field of ["sourceGeometrySHA256","bodyGeometrySHA256","underlayerGeometrySHA256",
   "activeModeSignature","fitterVersion","protectedMaskVersion"])
  assert(c.fitKey.includes(field),"Fit cache missing "+field);
 assert(!c.fitKey.some(x=>/dye|palette|roughness|normalMap|materialPreset|lightRig/i.test(x)),
   "Material color/lighting must not contaminate geometry-fit key");
 assert(c.materialKey.includes("materialPresetId"));
 for(const change of ["colorChangeOnly","roughnessChangeOnly","normalTextureChangeOnly","dyeGroupChangeOnly"])
  assert(c.neverGeometryRefitFor.includes(change));
 for(const change of ["actualFabricThicknessChange","garmentTopologyChange","skinWeightsChange",
   "underlayerShellChange","closureGeometryChange"])
  assert(c.requiresNewGeometryEvaluation.includes(change));
 assert(c.guarantee.includes("skin weights"));
});

test("No uploaded candidate can be silently rigged, equipped or published",()=>{
 const recipes=recipe.candidateRecipes;
 assert.deepEqual(Object.keys(recipes).sort(),candidates.candidates.map(x=>x.id).sort());
 for(const candidate of candidates.candidates){
  const item=recipes[candidate.id];
  assert.equal(item.class,"outerwear");
  assert.equal(item.firstFitStack[0],"body");
  assert.equal(item.firstFitStack.at(-1),candidate.id);
  assert.equal(item.allowAutomatedRigging,false);
  assert.equal(item.allowPublish,false);
  assert.equal(candidate.status,"intake-only");
 }
});
