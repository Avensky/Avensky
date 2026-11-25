import { GARAGE_ENTRY_POSTER, GARAGE_ENTRY_STORAGE_KEY } from "../../theme/garageEntry";

export const PLAYER_ONBOARDING = import.meta.env.VITE_PLAYER_ONBOARDING === "1";

export const stagingAccountPortal = import.meta.env.MODE === "staging" && typeof window !== "undefined"
  && window.location.hostname === "staging.avensky.com";

function entryAssetRoot() {
  // Installations can roll out the game and the standalone sign-in portal separately.
  if (stagingAccountPortal) {
    try {
      if (window.localStorage.getItem(GARAGE_ENTRY_STORAGE_KEY) === GARAGE_ENTRY_POSTER) return "/__alpha/entry";
    } catch { /* The bundled copy also works when storage is unavailable. */ }
  }
  return "/images";
}
export const entryAssets = entryAssetRoot();
