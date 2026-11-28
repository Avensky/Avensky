import type { CharacterChoice } from "../characterCatalog";
import { hairOptions, STOCK_HAIR_ID, STOCK_HAIR_LABEL, useLocalHairstyle } from "./LocalHairFeatures";
import { normalizeHairPalette, useHairPaletteStore, type HairPalette } from "./hairPalette";
import { DEFAULT_HAIR_GROOM, normalizeHairGroom, type HairGroom } from "./hairGroom";

type LocalHair = { id: string; palette: HairPalette; original: boolean; groom?: HairGroom };
type LocalOutfit = CharacterChoice & { localHair?: LocalHair };

export function captureLocalOutfit(choice: CharacterChoice): LocalOutfit {
  if (choice.id !== "mara-vega" || !hairOptions.length) return choice;
  const { id } = useLocalHairstyle.getState();
  if (id !== STOCK_HAIR_ID && !hairOptions.some(style => style.id === id)) return choice;
  const { palette, original, grooms } = useHairPaletteStore.getState();
  return { ...choice, localHair: { id, palette, original, groom: grooms[id] } };
}

export function restoreLocalOutfitHair(choice: LocalOutfit) {
  const hair = choice.localHair;
  if (choice.id !== "mara-vega" || !hair ||
    (hair.id !== STOCK_HAIR_ID && !hairOptions.some(style => style.id === hair.id))) return;
  useHairPaletteStore.setState({ palette: normalizeHairPalette(hair.palette), original: hair.original !== false });
  if (hairOptions.some(style => style.id === hair.id && style.editableGroom)) {
    useHairPaletteStore.getState().setGroom(hair.id, hair.groom ? normalizeHairGroom(hair.groom) : DEFAULT_HAIR_GROOM);
  }
  useLocalHairstyle.getState().choose(hair.id);
}

export function localOutfitHairLabel(choice: LocalOutfit) {
  return choice.localHair?.id === STOCK_HAIR_ID ? STOCK_HAIR_LABEL
    : hairOptions.find(style => style.id === choice.localHair?.id)?.label;
}
