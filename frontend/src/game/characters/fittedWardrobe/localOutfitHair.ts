import { characterAppearance, type CharacterChoice } from "../characterCatalog";
import fittedHair from "../../../../../packages/wardrobe-catalog/fitted-hair.json";
import { normalizeHairPalette, type HairPalette } from "./hairColors";
import { normalizeHairGroom, type HairGroom } from "./hairGroom";

type LegacyLocalOutfit = CharacterChoice & {
  localHair?: { id: string; palette: HairPalette; original: boolean; groom?: HairGroom };
};

/** Older device saves stored the fitting room's visible hair outside CharacterChoice. */
export function restoreLocalOutfitHair(outfit: LegacyLocalOutfit): CharacterChoice {
  if (!outfit.localHair) return outfit;
  const { localHair, ...choice } = outfit;
  if (choice.id !== "mara-vega") return choice;
  const style = fittedHair.find(style => style.id === localHair.id);
  if (!style && localHair.id !== "stock") return choice;
  if (!style) return { ...choice, appearance: { ...characterAppearance(choice), hair: "natural", hair_groom: undefined } };
  return { ...choice, appearance: { ...characterAppearance(choice), hair: style.id, hair_color: "original",
    hair_palette: localHair.original !== false ? undefined : normalizeHairPalette(localHair.palette),
    hair_groom: style.editableGroom && localHair.groom ? normalizeHairGroom(localHair.groom) : undefined } };
}

export function localOutfitHairLabel(outfit: LegacyLocalOutfit) {
  return outfit.localHair?.id === "stock" ? "Long braid and bonnet"
    : fittedHair.find(style => style.id === (outfit.localHair?.id ?? outfit.appearance?.hair))?.label;
}
