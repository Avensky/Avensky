import type { PoseSequence } from "./posePack";
import type { CreatedEmote } from "./emoteAuthoring";
import type { ClothingPiece } from "./clothingPieces";
import { create } from "zustand";
import type { WardrobePortrait } from "../preview/portraitFraming";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";

export const CHARACTER_CAMERAS = ["Full body", "Selected item", "Face", "Hands", "Whole car"] as const;
export const CHARACTER_ZOOM_MIN = .8;
export const CHARACTER_ZOOM_MAX = 1.25;
type Camera = typeof CHARACTER_CAMERAS[number] | WardrobePortrait;

const featureCameras = {
  hairstyle: "Hair", hair: "Hair", eyes: "Eyes", brows: "Eyes",
  makeup: "Makeup", skin: "Face", tattoo: "Full body",
} as const satisfies Record<string, Camera>;

export function focusWardrobeFeature(step: keyof typeof featureCameras | null) {
  const camera = step ? featureCameras[step] : "Full body";
  const state = useCharacterPreviewStore.getState();
  if (state.camera !== camera || state.emote) {
    useCharacterPreviewStore.setState({ camera, zoom: 1, emote: null, focusRevision: state.focusRevision + 1 });
  }
}

export const useCharacterPreviewStore = create<{
  viewport: { left: number; top: number; width: number; height: number } | null;
  selectedPiece: ClothingPiece;
  focusRevision: number;
  playbackPaused: boolean;
  automaticEmotes: boolean;
  camera: Camera;
  zoom: number;
  emote: { id: string; sequence?: PoseSequence; created?: CreatedEmote } | null;
  loopEmote: boolean;
  cockpitVehicle: VehicleModelId | null;
  cockpitAvailable: boolean;
  cockpitError: string | null;
  insideCar: boolean;
  brzDoorReady: boolean;
  brzDoorBusy: boolean;
  brzPassengerAvailable: boolean;
  brzPassenger: boolean;
  brzExitSupported: boolean;
  brzExitReady: boolean;
  brzExiting: boolean;
  brzEngineAvailable: boolean;
  brzHoodBusy: boolean;
  leanAvailable: boolean;
  mirrorAvailable: boolean;
}>(() => ({ viewport: null, selectedPiece: "corset", focusRevision: 0, playbackPaused: false, automaticEmotes: true,
  camera: "Full body", zoom: 1, emote: null, loopEmote: false, cockpitVehicle: null, cockpitAvailable: false,
  cockpitError: null, insideCar: false, brzDoorReady: false, brzDoorBusy: false, brzPassengerAvailable: false,
  brzPassenger: false, brzExitSupported: false, brzExitReady: false, brzExiting: false,
  brzEngineAvailable: false, brzHoodBusy: false,
  leanAvailable: false, mirrorAvailable: false }));

export function failCockpitPreview(message: string) {
  if (useCharacterPreviewStore.getState().insideCar) {
    useCharacterPreviewStore.setState({ insideCar: false, brzPassenger: false, brzExitReady: false, brzExiting: false, emote: null, cockpitError: message });
  }
}

export function focusClothingPiece(selectedPiece: ClothingPiece) {
  useCharacterPreviewStore.setState(s => ({ selectedPiece, camera: "Selected item", zoom: 1, emote: null, focusRevision: s.focusRevision + 1 }));
}
