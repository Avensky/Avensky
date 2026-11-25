import { assetAvailable } from "../../assets/runtimeAssets";
import { useAssetGLTF } from "../../assets/useAssetGLTF";

export const GARAGE_MODEL_PATH = "/models/world/garage_special.glb?v=complete-1";

/** Start decoding into the preview's existing loader cache without mounting a canvas. */
export function preloadGarage() {
  if (assetAvailable(GARAGE_MODEL_PATH)) useAssetGLTF.preload(GARAGE_MODEL_PATH, "/draco/");
}
