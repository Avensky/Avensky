declare const __FITTED_HAIR_URLS__: string[];
declare const __FITTED_HAIR_STYLES__: Array<{ id: string; label: string; url: string; mesh: string; editableGroom?: boolean }>;

const folder = "/models/characters/female/wardrobe/alpha";
export const tennisFittingBodyUrl = `${folder}/vesper-tennis-fit-body.glb`;
export const tennisDressBodyUrl = `${folder}/vesper-tennis-dress-body.glb`;
export const fittedHairCatalog = [
  { id: "Space_Buns", label: "Space Buns & Loose Waves", url: `${folder}/space-buns.glb` },
  { id: "Mia_01", label: "Braided Ponytail", url: `${folder}/mia-braided-ponytail.glb` },
];
export const fittedTennisGarments = [
  { id: "local-tennis-dress", label: "Tennis Dress", section: "Dresses", category: "outfits", slot: "dress", piece: "dress", url: `${folder}/tennis-dress.glb` },
  { id: "local-wave-wedges", label: "Wave Wedge Sandals", section: "Shoes", category: "footwear", slot: "shoes", piece: "shoes", preserveSkin: true, url: `${folder}/wave-wedge-sandals.glb` },
] as const;
const installedHair = typeof __FITTED_HAIR_URLS__ === "undefined" ? [] : __FITTED_HAIR_URLS__;
// One catalog is the source of truth: adding a fitted-hair.json record and a
// private staging asset automatically grows the selection menu at the next build.
// The build injects this directly from the registered fitted-hair.json records,
// filtering out unregistered S3 URLs. Do not maintain a second manual hair list.
const stagedHair = typeof __FITTED_HAIR_STYLES__ === "undefined" ? [] : __FITTED_HAIR_STYLES__;
export const fittedHairOptions = [
  ...fittedHairCatalog.filter(style => installedHair.includes(style.url) && !stagedHair.some(staged => staged.id === style.id)),
  ...stagedHair,
];
