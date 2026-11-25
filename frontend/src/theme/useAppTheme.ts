import { useMotionView } from "../store/session/networkViews";
import { HEROES } from "../store/alpha/alphaStore";

import { useHeroLoadouts } from "../vehicles/cosmetics/heroLoadouts";
import { useEffect } from "react";
import { usePreferencesStore } from "../store/preferences";
import { applyUITheme, selectedGarageTheme } from "./catalog";
import { applyGaragePreferences } from "./garagePreferences";
import { useMatchTeamTheme } from "./useMatchTeamTheme";
import "./theme.css";
/** Mount once at the app/preview root. Accessibility follows the same persisted
 * owner on every screen; standalone previews do not invent their own palette. */
export function useAppTheme() {
  const effects = usePreferencesStore(s => s.garageEffects);
  const theme = usePreferencesStore((s) => s.theme),
    garage = usePreferencesStore(selectedGarageTheme),
    motion = usePreferencesStore((s) => s.reducedMotion),
    contrast = usePreferencesStore((s) => s.highContrast),
    scale = usePreferencesStore((s) => s.menuTextScale),
    cosmetics = usePreferencesStore((s) => s.vehicleCosmetics);
  const body=useMotionView(s=>s.getMe()?.appearance?.body);
  const savedBody=useHeroLoadouts(s=>s.loadouts[HEROES.find(h => h.id === s.defaultHero)?.vehicle ?? ""]?.body);
  useEffect(() => {
    applyUITheme(theme, garage);
    const root = document.documentElement;
    const chosen=body??savedBody;
    const accent = chosen && chosen !== "factory" ? chosen : null;
    root.style.setProperty("--vehicle-accent", cosmetics.matchCockpit ? (accent && accent !== "theme" ? accent : "var(--app-accent)") : "#a13c3d");
    root.dataset.matchCockpit = String(cosmetics.matchCockpit);
    applyGaragePreferences(root, effects, motion, contrast);
    root.style.setProperty("--menu-text-scale", String(scale));
  }, [theme, garage, effects, motion, contrast, scale, cosmetics, body, savedBody]);
  useMatchTeamTheme();
}
