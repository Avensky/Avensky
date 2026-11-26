import type { CharacterLook } from "./characterCatalog";
import type { WardrobeGarment } from "./wardrobeGarments";

export type CharacterPortraitJob = {
  look: CharacterLook;
  modelUrl: string;
  hairstylePreview?: boolean;
  dress?: { item: WardrobeGarment; url: string };
};

export type CharacterPortraitResult = { image: Blob } | { error: string };
