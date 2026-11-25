declare const __FITTED_HAIR_URLS__: string[];
declare const __FITTED_HAIR_STYLES__: Array<{ id: string; label: string; url: string; mesh: string }>;

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
// Staging can preview every fitted hair registered in the private catalog.
// These mesh names are independent of wardrobe choice IDs.
const installedExternalHair = typeof __FITTED_HAIR_STYLES__ === "undefined" ? [] : __FITTED_HAIR_STYLES__;
export const fittedHairOptions = [
  ...fittedHairCatalog.filter(style => installedHair.includes(style.url)),
  ...installedExternalHair,
];
