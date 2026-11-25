import fittedHairManifest from "../../../../../packages/wardrobe-catalog/fitted-hair.json";

declare const __FITTED_HAIR_URLS__: string[];
declare const __FITTED_HAIR_IDS__: string[];


const folder = "/models/characters/female/wardrobe/alpha";
export const fittedHairCatalog = [
  { id: "Space_Buns", label: "Space Buns & Loose Waves", url: `${folder}/space-buns.glb` },
  { id: "Mia_01", label: "Mia Braided Ponytail", url: `${folder}/mia-braided-ponytail.glb` },
];
export const fittedTennisGarments = [
  { id: "local-tennis-dress", label: "Tennis Dress", section: "Dresses", category: "outfits", slot: "dress", piece: "dress", url: `${folder}/tennis-dress.glb` },
  { id: "local-wave-wedges", label: "Wave Wedge Sandals", section: "Shoes", category: "footwear", slot: "shoes", piece: "shoes", preserveSkin: true, url: `${folder}/wave-wedge-sandals.glb` },
] as const;
const installedHair = typeof __FITTED_HAIR_URLS__ === "undefined" ? [] : __FITTED_HAIR_URLS__;
// One catalog is the source of truth: adding a fitted-hair.json record and a
// private staging asset automatically grows the selection menu at the next build.
const stagedHairIds = new Set(typeof __FITTED_HAIR_IDS__ === "undefined" ? [] : __FITTED_HAIR_IDS__);
export const fittedHairOptions = [
  ...fittedHairCatalog.filter(style => installedHair.includes(style.url)),
  ...fittedHairManifest.filter(style => stagedHairIds.has(style.id))
    .map(({ id, label, url, mesh }) => ({ id, label, url, mesh })),
];
