import { useSyncExternalStore } from "react";
import catalog from "../../../../packages/wardrobe-catalog/characters.json";
import type { CharacterChoice } from "./characterCatalog";

const LOCAL_CHARACTER_KEY = "avenlab-local-character-v1";
const characterListeners = new Set<() => void>();
let localCharacter: { raw: string | null; choice: CharacterChoice | undefined } | undefined;
const skipSubscription = () => () => {};
const noCharacter = () => undefined;

export function isSavedChoice(value: unknown): value is CharacterChoice {
  if (!value || typeof value !== "object") return false;
  const { id, outfit } = value as Partial<CharacterChoice>;
  return catalog.some(character => character.id !== "niko-park" && character.id === id && character.outfits.some(item => item.id === outfit));
}

export function parseStoredValue(raw: string | null): unknown {
  try {
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function readLocalCharacter(): CharacterChoice | undefined {
  try {
    const raw = window.localStorage.getItem(LOCAL_CHARACTER_KEY);
    if (localCharacter?.raw !== raw) {
      const value = parseStoredValue(raw);
      localCharacter = { raw, choice: isSavedChoice(value) ? value : undefined };
    }
    return localCharacter.choice;
  } catch {
    return undefined;
  }
}

export function writeLocalCharacter(choice: CharacterChoice) {
  window.localStorage.setItem(LOCAL_CHARACTER_KEY, JSON.stringify(choice));
  characterListeners.forEach(listener => listener());
}

function subscribeLocalCharacter(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LOCAL_CHARACTER_KEY) listener();
  };
  characterListeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    characterListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLocalCharacter(enabled: boolean) {
  return useSyncExternalStore(enabled ? subscribeLocalCharacter : skipSubscription,
    enabled ? readLocalCharacter : noCharacter, noCharacter);
}
