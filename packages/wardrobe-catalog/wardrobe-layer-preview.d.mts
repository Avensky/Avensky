export type WardrobeLayerPreviewStatus = "blocked" | "needs-fitting" | "unverified";
export type WardrobeLayerSavedItem = {
  source: "garments" | "wardrobe" | "wardrobeTrial";
  slot: string;
  id: string;
  label: string;
  classId: string | null;
  status: "preserved" | "candidate" | "suspended" | "unmapped" | "retired";
  modes: Record<string,string>;
  reviewStatus: WardrobeLayerPreviewStatus | "allowed";
};
export type WardrobeLayerPreview = {
  schemaVersion: 1;
  baseOutfitId: string;
  saved: WardrobeLayerSavedItem[];
  status: WardrobeLayerPreviewStatus;
  issues: {code:string; garmentIds:string[]; regions:string[]; message:string}[];
  regions: {id:string; label:string; orderedIds:string[]; status:WardrobeLayerPreviewStatus; hasCycle:boolean}[];
  occlusionIntents: {garmentId:string; outerGarmentId:string; region:string; intent:"expose-opening"|"may-cover"}[];
  removedClothing: string[];
  audited:false;
  rendererIntegrated:false;
  note:string;
  error:string|null;
};
export function buildWardrobeLayerPreview(
  choice:object,
  options:{
    catalog?: ReadonlyArray<{id:string;label?:string;slot:string;piece:string;retired?:boolean}>;
    rules:object;
  }
): WardrobeLayerPreview;
