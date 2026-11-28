import { isSavedChoice, parseStoredValue, useLocalCharacter } from "./deviceCharacter";
export { readLocalCharacter, writeLocalCharacter } from "./deviceCharacter";
import { canUseDeviceCharacter, selectEquippedCharacter, useSocialStore } from "../../store/social/socialStore";
import { DEFAULT_CHARACTER, type CharacterChoice } from "./characterCatalog";

export const LOCAL_OUTFITS_KEY = "avenlab-saved-outfits-v1";
export const OUTFIT_NAME_CONFLICT = "That name belongs to another character's outfit.";
type Outfits = Record<string, CharacterChoice>;

function readStoredOutfits(): Record<string, unknown> {
  const value = parseStoredValue(window.localStorage.getItem(LOCAL_OUTFITS_KEY));
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function availableOutfits(outfits: Record<string, unknown>): Outfits {
  return Object.fromEntries(Object.entries(outfits).filter((entry): entry is [string, CharacterChoice] => isSavedChoice(entry[1])));
}

export function readLocalOutfits(): Outfits {
  try {
    return availableOutfits(readStoredOutfits());
  } catch {
    return {};
  }
}

export function writeLocalOutfit(name: string, choice?: CharacterChoice): Outfits {
  const outfits = readStoredOutfits();
  const existing = outfits[name];
  if (choice && isSavedChoice(existing) && existing.id !== choice.id) throw new Error(OUTFIT_NAME_CONFLICT);
  if (choice) Object.defineProperty(outfits, name, { value: choice, enumerable: true, configurable: true });
  else delete outfits[name];
  window.localStorage.setItem(LOCAL_OUTFITS_KEY, JSON.stringify(outfits));
  return availableOutfits(outfits);
}

export function useSavedPlayerCharacter(allowLocal = true) {
  const equipped = useSocialStore(selectEquippedCharacter);
  const device = useSocialStore(canUseDeviceCharacter);
  const local = useLocalCharacter(allowLocal && device);
  return equipped ?? local;
}

export function usePlayerCharacter() {
  return useSavedPlayerCharacter() ?? DEFAULT_CHARACTER;
}
