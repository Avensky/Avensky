import { sanitizeGarageEffects, type GarageEffects } from "../store/preferences/garageEffects.ts";

export function applyGaragePreferences(root: HTMLElement, effects: GarageEffects, reducedMotion: boolean, contrast: boolean) {
  root.dataset.garageBrightness = String(effects.accentBrightness);
  root.dataset.garageEnvironment = String(effects.environmentReflections);
  root.dataset.garageFloor = effects.floorFinish;
  root.dataset.garageReflectivity = String(effects.floorReflections ? effects.reflectionStrength : 0);
  root.dataset.reduceMotion = String(reducedMotion);
  root.dataset.highContrast = String(contrast);
}

// The public sign-in entry has no game store. Hydrate the same saved values before the first frame.
export function restoreGaragePreferences(root: HTMLElement) {
  if (root.dataset.garageBrightness !== undefined) return;
  try {
    const saved = JSON.parse(localStorage.getItem("avenlab-preferences-v1") ?? "{}")?.state;
    applyGaragePreferences(root, sanitizeGarageEffects(saved?.garageEffects), saved?.reducedMotion === true, saved?.highContrast === true);
  } catch { /* A fresh or storage-restricted session uses the scene defaults. */ }
}
