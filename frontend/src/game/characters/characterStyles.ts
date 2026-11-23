import styles from "../../../../packages/wardrobe-catalog/character-styles.json";
import { CHARACTER_PERSONALITIES, type CharacterPersonality } from "./characterPersonality";
import { ROOK_ID, VILLAGER_ID, type CharacterChoice } from "./characterCatalog";

export type CharacterBody = "female" | "male";

export const CHARACTER_STYLES = styles;

export function styleName(id: string) {
  return styles.find(style => style.id === id)?.name ?? "Original look";
}

export function attitudeName(id: string) {
  return CHARACTER_PERSONALITIES.find(attitude => attitude.id === id)?.label;
}

export function styleLook(style: typeof styles[number], body: CharacterBody): CharacterChoice {
  const outfit = style[body];
  return { id: body === "female" ? VILLAGER_ID : ROOK_ID, identity: body, outfit: outfit.outfit,
    appearance: { hair: "natural", hair_color: "original", skin: "original", headwear: "none",
      color: outfit.color, accent: outfit.accent, personality: style.attitude as CharacterPersonality } };
}
