/**
 * W-05: reversible layer-mode metadata for legacy CharacterChoice.
 * Old garments, corsets, removals and dye fields remain authoritative.
 */
import {classifyWardrobeCatalogItem} from "./resolve-wardrobe-layers.mjs";

const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const clone=x=>structuredClone(x);
const key=x=>x.source+":"+x.slot;
const order=(a,b)=>a<b?-1:a>b?1:0;
const sources=new Set(["garments","wardrobe","wardrobeTrial"]);
function reject(code,text){const e=new Error(text);e.code=code;throw e;}
function selections(choice){
  const result=[];
  if(plain(choice.garments))for(const [slot,id] of Object.entries(choice.garments))
    if(typeof id==="string"&&id)result.push({source:"garments",slot,id});
  for(const source of ["wardrobe","wardrobeTrial"])if(typeof choice[source]?.set==="string"&&choice[source].set)
    result.push({source,slot:"corset",id:choice[source].set});
  return result.sort((a,b)=>order(key(a),key(b)));
}
function garmentClass(ref,catalog){
  if(ref.source!=="garments")return "corset";
  const item=catalog.find(g=>g.id===ref.id&&g.slot===ref.slot);
  return classifyWardrobeCatalogItem(item);
}
export function validateLegacyLayerSidecar(choice,{catalog=[],rules}={}){
  if(!plain(choice)||typeof choice.id!=="string"||!choice.id||
     typeof choice.outfit!=="string"||!choice.outfit)reject("INVALID_CHOICE","Saved character choice required");
  if(choice.wardrobeLayers===undefined)return {valid:true,entries:[]};
  if(!plain(rules)||rules.schemaVersion!==1)reject("MISSING_RULES","Validated v1 class rules required");
  const layer=choice.wardrobeLayers;
  if(!plain(layer)||layer.schemaVersion!==1||!Array.isArray(layer.entries)||
     layer.entries.length>32||Object.keys(layer).some(k=>!["schemaVersion","entries"].includes(k)))
    reject("INVALID_LAYER_SAVE","Unknown or malformed wardrobeLayers version");
  const expected=new Map(selections(choice).map(x=>[key(x),x])),seen=new Set();
  for(const entry of layer.entries){
    if(!plain(entry)||!sources.has(entry.source)||typeof entry.slot!=="string"||!entry.slot||
       typeof entry.id!=="string"||!entry.id||!plain(entry.modes)||
       Object.keys(entry).some(k=>!["source","slot","id","modes"].includes(k)))
      reject("INVALID_LAYER_ENTRY","Malformed layer metadata entry");
    const k=key(entry);
    if(seen.has(k))reject("DUPLICATE_LAYER_ENTRY","Repeated "+k);
    seen.add(k);
    if(expected.get(k)?.id!==entry.id)reject("STALE_LAYER_ENTRY","Saved slot and metadata disagree: "+k);
    const cls=garmentClass(entry,catalog);
    if(!cls&&Object.keys(entry.modes).length)
      reject("UNMAPPED_LAYER_CLASS","Unknown accessory cannot accept new fit modes");
    const options=rules.classes[cls]?.modes??{};
    for(const [group,value] of Object.entries(entry.modes))
      if(!options[group]?.choices?.includes(value))
        reject("INVALID_LAYER_MODE","Unknown "+group+"="+String(value));
    if(entry.source!=="garments"&&entry.modes.waist!==undefined&&
       entry.modes.waist!==choice[entry.source]?.waist)
      reject("WAIST_MISMATCH","Layer waist cannot disagree with existing corset waist");
  }
  return {valid:true,entries:layer.entries};
}
export function migrateLegacyOutfit(choice,{catalog=[],rules}={}){
  if(!plain(rules)||rules.schemaVersion!==1)reject("MISSING_RULES","Layer rules v1 required");
  const original=clone(choice);
  validateLegacyLayerSidecar(original,{catalog,rules});
  const refs=selections(original);
  const entries=(original.wardrobeLayers?.entries??refs.map(ref=>({
    ...ref,modes:ref.source==="garments"?{}:{waist:original[ref.source].waist}
  }))).map(x=>({source:x.source,slot:x.slot,id:x.id,modes:{...x.modes}}))
     .sort((a,b)=>order(key(a),key(b)));
  const lookup=new Map(entries.map(entry=>[key(entry),entry]));
  const projection=refs.map(ref=>{
    const cls=garmentClass(ref,catalog);
    const modes={
      ...Object.fromEntries(Object.entries(rules.classes[cls]?.modes??{})
        .map(([name,values])=>[name,values.default])),
      ...(ref.source==="garments"?{}:{waist:original[ref.source].waist}),
      ...(lookup.get(key(ref))?.modes??{})
    };
    const selectedTop=Boolean(original.garments?.top||original.garments?.dress);
    const suspended=ref.source==="wardrobe"&&Boolean(original.wardrobeTrial)||
      ref.source!=="garments"&&selectedTop&&modes["body-fit"]!=="over-top"||
      ref.source==="garments"&&Array.isArray(original.removedClothing)&&
       (original.removedClothing.includes(ref.slot)||
         ref.slot==="skirt"&&original.removedClothing.includes("outer-skirt"));
    const item=ref.source==="garments"?
      catalog.find(x=>x.id===ref.id&&x.slot===ref.slot):null;
    return {...ref,classId:cls,modes,sourceStatus:suspended?"suspended":"candidate",
      rendererIntegrated:false,...(!cls?{reason:"UNMAPPED_CLASS"}:{}),
      ...(item?.retired?{catalogStatus:"retired"}:{})};
  });
  return {choice:{...original,wardrobeLayers:{schemaVersion:1,entries}},
    selections:projection,diagnostics:projection.filter(x=>x.reason||x.catalogStatus)
      .map(x=>({source:x.source,slot:x.slot,id:x.id,code:x.reason??"RETIRED_ASSET"}))};
}
export function revertLayerMigration(choice){
  if(!plain(choice))reject("INVALID_CHOICE","Outfit object required");
  const original=clone(choice);delete original.wardrobeLayers;return original;
}
export function withLegacyLayerMode(choice,target,group,value,{catalog=[],rules}={}){
  const preview=migrateLegacyOutfit(choice,{catalog,rules});
  const ref=selections(preview.choice).find(x=>x.source===target?.source&&x.slot===target?.slot);
  if(!ref)reject("UNKNOWN_SELECTION","Mode cannot create a new equipped garment");
  const cls=garmentClass(ref,catalog);
  if(!cls)reject("UNMAPPED_LAYER_CLASS","No layer class for this garment");
  if(!rules.classes[cls]?.modes?.[group]?.choices?.includes(value))
    reject("INVALID_LAYER_MODE","Invalid or unsupported mode");
  if(ref.source!=="garments"&&group==="waist"&&
     preview.choice[ref.source].waist!==value)
    reject("WAIST_MISMATCH","Use existing corset waist fitting controls first");
  let entry=preview.choice.wardrobeLayers.entries.find(x=>key(x)===key(ref));
  if(!entry){entry={...ref,modes:{}};preview.choice.wardrobeLayers.entries.push(entry);
    preview.choice.wardrobeLayers.entries.sort((a,b)=>order(key(a),key(b)));}
  entry.modes[group]=value;
  validateLegacyLayerSidecar(preview.choice,{catalog,rules});
  return preview.choice;
}
export function plannedLayerCandidates(choice,config){
  const projected=migrateLegacyOutfit(choice,config);
  return {equipped:projected.selections.filter(x=>x.classId&&x.sourceStatus==="candidate")
    .map(x=>({id:x.id,classId:x.classId,origin:"explicit",modes:{...x.modes}})),
    suspended:projected.selections.filter(x=>x.sourceStatus==="suspended"),
    diagnostics:projected.diagnostics,rendererIntegrated:false};
}
