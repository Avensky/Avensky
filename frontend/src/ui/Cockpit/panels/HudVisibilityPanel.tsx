import { useUIStore } from "../../../store/menus/uiStore";

/** Stable public entry for the HUD layout shortcut. Settings owns the complete
 * visibility list; this shortcut opens the same settings. */
export function HudVisibilityPanel() {
  return (
    <button
      type="button"
      className="hud-settings-link"
      aria-label="Open HUD layout settings"
      onClick={() => useUIStore.getState().openSettings("hud")}
    >
      HUD LAYOUT <span aria-hidden="true">→</span>
    </button>
  );
}
