import styles from "../../../../packages/wardrobe-catalog/character-styles.json";
import { CHARACTER_PERSONALITIES, type CharacterPersonality } from "./characterPersonality";
import { ROOK_ID, VILLAGER_ID, availableHairStyles, characterAppearance, type CharacterChoice } from "./characterCatalog";

export type CharacterBody = "female" | "male";

export const CHARACTER_STYLES = styles;

export function styleName(id: string) {
  return styles.find(style => style.id === id)?.name ?? "Original look";
}

export function attitudeName(id: string) {
  return CHARACTER_PERSONALITIES.find(attitude => attitude.id === id)?.label;
}

export function styleLook(style: typeof styles[number], body: CharacterBody) {
  const outfit = style[body];
  return { id: body === "female" ? VILLAGER_ID : ROOK_ID, identity: body, outfit: outfit.outfit,
    appearance: { hair: "natural", hair_color: "original", skin: "original", headwear: "none",
      color: outfit.color, accent: outfit.accent, personality: style.attitude as CharacterPersonality } } satisfies CharacterChoice;
}

/** Starter kits own the outfit and its emotes. Appearance choices belong to the player. */
export function applyCreatorWardrobe(starter: CharacterChoice, previous?: CharacterChoice): CharacterChoice {
  const kit = starter.appearance ?? characterAppearance(starter);
  if (!previous) return { ...starter, appearance: { ...kit, makeup: "rose" } };
  const previousLook = previous.appearance ?? characterAppearance(previous);
  // A wardrobe change on the same female rig also preserves a saved private
  // hairstyle when its assets are temporarily unavailable on this device.
  const keepSavedHair = previous.id === starter.id && starter.id === VILLAGER_ID;
  const hair = keepSavedHair || availableHairStyles(starter.id).some(style => style.id === previousLook.hair)
    ? previousLook.hair : "natural";
  return { ...starter, appearance: {
    ...previousLook, hair, face_shape: previous.id === starter.id ? previousLook.face_shape : undefined,
    color: kit.color, accent: kit.accent, headwear: kit.headwear,
    item_colors: kit.item_colors, bra_style: kit.bra_style, briefs_style: kit.briefs_style, personality: kit.personality,
  } };
}

export function creatorChoice(styleId: string, body: CharacterBody, previous?: CharacterChoice): CharacterChoice {
  const style = styles.find(entry => entry.id === styleId) ?? styles[0];
  return applyCreatorWardrobe(styleLook(style, body), previous);
}
