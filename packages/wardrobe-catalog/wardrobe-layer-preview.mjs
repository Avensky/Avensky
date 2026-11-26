/**
 * W-06 read-only wardrobe compatibility projection.
 * Never edits CharacterChoice, localStorage, server data, GLBs, or camera state.
 * A plan is NOT a verified render or geometry pass.
 */
import {migrateLegacyOutfit} from "./migrate-legacy-wardrobe.mjs";
import {resolveWardrobeLayers} from "./resolve-wardrobe-layers.mjs";

const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const key = x => x.source+":"+x.slot;
const prettyRegion = id => id.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,c=>c.toUpperCase());

function legacyEntries(choice,catalog) {
  const entries = [];
  if(plain(choice?.garments)) for(const [slot,id] of Object.entries(choice.garments)) {
    if(typeof id === "string" && id) entries.push({source:"garments",slot,id});
  }
  for(const source of ["wardrobe","wardrobeTrial"]) {
    const id = choice?.[source]?.set;
    if(typeof id === "string" && id) entries.push({source,slot:"corset",id});
  }
  return entries.sort((a,b)=>compare(key(a),key(b))).map(ref=>({
    ...ref,label:catalog.find(item=>item.id===ref.id)?.label ?? ref.id,
    classId:null,status:"preserved",modes:{},reviewStatus:"unverified",
  }));
}
const fatal = code => ["INCOMPATIBLE_CLASS","MODE_CONFLICT","ORDER_CYCLE","UNKNOWN_CLASS",
  "DUPLICATE_GARMENT","INVALID_ENTRY","INVALID_MODE","MISSING_ASSET","RIG_MISMATCH",
  "UNSUPPORTED_STACK"].includes(code);

/**
 * Consumes the W-05 sidecar as evidence-free, read-only intent.
 * Legacy base outfits and bundled clothing are not yet fully decomposed;
 * do not use the returned model to hide or render any mesh.
 */
export function buildWardrobeLayerPreview(choice,{catalog=[],rules}={}) {
  const original = choice ?? {};
  const base = {
    schemaVersion:1,baseOutfitId:typeof original.outfit==="string"?original.outfit:"",
    saved:legacyEntries(original,catalog),status:"unverified",
    issues:[],regions:[],occlusionIntents:[],
    removedClothing:Array.isArray(original.removedClothing)?[...original.removedClothing]:[],
    audited:false,rendererIntegrated:false,
    note:"Planning only. Base outfit geometry, fit, collisions and actual visibility are not verified.",
    error:null,
  };
  try {
    const migrated=migrateLegacyOutfit(original,{catalog,rules});
    base.saved=migrated.selections.map(ref=>{
      const item=catalog.find(x=>x.id===ref.id && (ref.source!=="garments"||x.slot===ref.slot));
      const status=ref.catalogStatus==="retired"?"retired"
        :!ref.classId?"unmapped":ref.sourceStatus==="suspended"?"suspended":"candidate";
      return {
        source:ref.source,slot:ref.slot,id:ref.id,
        label:item?.label ?? ref.id,classId:ref.classId,
        status,modes:{...ref.modes},reviewStatus:"unverified",
      };
    });
    // No source files, revision hashes or mesh measurements are supplied.
    // Without reviewed evidence, the resolver never approves an overlap.
    const equipped=base.saved.filter(x=>x.status==="candidate").map(x=>({
      id:x.id,classId:x.classId,slot:x.slot,origin:"explicit",modes:{...x.modes}
    }));
    const resolved=resolveWardrobeLayers({
      equipped,bodyProfileId:"unmeasured-preview",tier:"garage",poseId:"not-verified",
      fitEvidence:[],visibilityEvidence:[]
    },rules);
    const membership=new Map(resolved.membership.map(x=>[x.id,x]));
    base.saved=base.saved.map(x=>{
      const graphStatus=x.status==="candidate"?membership.get(x.id)?.status:null;
      // A solo node or a pair with no conflict is graph-compatible only.
      // In this read-only UI there is no authenticated geometry/pose evidence.
      const reviewStatus=graphStatus==="allowed"?"unverified":graphStatus ?? "unverified";
      return {...x,reviewStatus};
    });
    const groups=new Map();
    for(const problem of resolved.issues) {
      const groupKey=problem.code+":"+problem.garmentIds.join("|");
      const existing=groups.get(groupKey)??{
        code:problem.code,garmentIds:[...problem.garmentIds],
        regions:[],message:problem.message,
      };
      if(problem.region && !existing.regions.includes(problem.region))existing.regions.push(problem.region);
      groups.set(groupKey,existing);
    }
    base.issues=[...groups.values()].map(x=>({...x,regions:x.regions.sort(compare)}))
      .sort((a,b)=>compare(a.code,b.code)||compare(a.garmentIds.join("|"),b.garmentIds.join("|")));
    const eligibleRegions=resolved.regions.filter(x=>equipped.filter(g=>rules.classes[g.classId]?.regions?.includes(x.region)).length>1);
    base.regions=eligibleRegions.map(x=>({
      id:x.region,label:prettyRegion(x.region),orderedIds:[...x.order],
      status:x.hasCycle?"blocked":x.provisional?"needs-fitting":"unverified",
      hasCycle:x.hasCycle
    }));
    base.occlusionIntents=resolved.occlusionIntents.map(x=>({...x}));
    base.status=base.issues.some(x=>fatal(x.code))?"blocked":
      base.issues.length?"needs-fitting":"unverified";
    // Even an issue-free single-item graph lacks geometry or appearance approval.
    return base;
  } catch(error) {
    base.error=error instanceof Error?error.message:"Layer metadata could not be read";
    base.issues=[{code:"INVALID_LAYER_SAVE",garmentIds:[],regions:[],message:base.error}];
    base.status="blocked";
    return base;
  }
}
