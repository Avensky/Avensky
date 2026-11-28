import type { ClothingPiece } from "./clothingPieces";
import type { CharacterLook } from "./characterCatalog";
import type { WardrobeGarment } from "./wardrobeGarments";

export type CharacterPortraitJob = {
  look: CharacterLook;
  modelUrl: string;
  hairstylePreview?: boolean;
  dress?: { item: WardrobeGarment; url: string };
};

export type CharacterPortraitResult = { image: Blob } | { error: string };

export type WardrobePortraitJob =
  | { kind: "garment"; modelUrl: string; nodes?: readonly string[] }
  | { kind: "outfit"; modelUrl: string; look: CharacterLook; bag: boolean; piece?: ClothingPiece };

export type PortraitJob = CharacterPortraitJob | WardrobePortraitJob;
