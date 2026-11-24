import type { CharacterChoice } from "../characterCatalog";
import { hairOptions, useLocalHairstyle } from "./LocalHairFeatures";
import { normalizeHairPalette, useHairPaletteStore, type HairPalette } from "./hairPalette";

type LocalHair = { id: string; palette: HairPalette; original: boolean };
type LocalOutfit = CharacterChoice & { localHair?: LocalHair };

export function captureLocalOutfit(choice: CharacterChoice): LocalOutfit {
  if (choice.id !== "mara-vega" || !hairOptions.length) return choice;
  const { id } = useLocalHairstyle.getState();
  if (id !== "stock" && !hairOptions.some(style => style.id === id)) return choice;
  const { palette, original } = useHairPaletteStore.getState();
  return { ...choice, localHair: { id, palette, original } };
}

export function restoreLocalOutfitHair(choice: LocalOutfit) {
  const hair = choice.localHair;
  if (choice.id !== "mara-vega" || !hair ||
    (hair.id !== "stock" && !hairOptions.some(style => style.id === hair.id))) return;
  useHairPaletteStore.setState({ palette: normalizeHairPalette(hair.palette), original: hair.original !== false });
  useLocalHairstyle.getState().choose(hair.id);
}

export function localOutfitHairLabel(choice: LocalOutfit) {
  return hairOptions.find(style => style.id === choice.localHair?.id)?.label;
}
