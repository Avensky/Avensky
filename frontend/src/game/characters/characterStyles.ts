import styles from "../../../../packages/wardrobe-catalog/character-styles.json";
import { CHARACTER_PERSONALITIES, type CharacterPersonality } from "./characterPersonality";
import { ROOK_ID, VILLAGER_ID, installedHairStyles, type CharacterChoice } from "./characterCatalog";

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

type StarterStyle = typeof styles[number];

function starterHair(style: StarterStyle, body: CharacterBody) {
  const id = style[body].hair;
  return body === "female" ? installedHairStyles(VILLAGER_ID).find(hair => hair.id === id) : undefined;
}

export function creatorStarterHairLabel(styleId: string, body: CharacterBody) {
  const style = styles.find(entry => entry.id === styleId) ?? styles[0];
  return starterHair(style, body)?.label ?? (body === "female" ? "Village braid" : "Short cut");
}

/** Replace the personality's starter kit while retaining the player's individual face colors. */
export function creatorChoice(styleId: string, body: CharacterBody, previous?: CharacterChoice): CharacterChoice {
  const style = styles.find(entry => entry.id === styleId) ?? styles[0];
  const choice = styleLook(style, body);
  const appearance = previous?.appearance;
  return { ...choice, appearance: {
    ...choice.appearance, hair: starterHair(style, body)?.id ?? "natural",
    skin: appearance?.skin ?? "original", hair_color: appearance?.hair_color ?? "original",
    makeup: appearance?.makeup ?? "none", eye_color: appearance?.eye_color, brow_color: appearance?.brow_color,
  } };
}
