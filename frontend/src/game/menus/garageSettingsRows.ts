import type { MenuRow } from "../../components/menus/TabbedMenu";
import {
  DEFAULT_GARAGE_EFFECTS,
  type GarageEffects,
} from "../../store/preferences/garageEffects";

import { UI_THEMES, type GarageTheme } from "../../theme/catalog";

const roomThemes = ["auto", ...Object.keys(UI_THEMES)] as GarageTheme[];

type NumberKey = {
  [K in keyof GarageEffects]: GarageEffects[K] extends number ? K : never;
}[keyof GarageEffects];
const cycle = <T,>(values: T[], value: T, dir = 1) =>
  values[
    (Math.max(0, values.indexOf(value)) + dir + values.length) % values.length
  ];

/** The shared menu row owner supplies click, arrows, controller and scrolling. */
export function garageSettingsRows(
  settings: GarageEffects,
  contrast: boolean,
  update: (patch: Partial<GarageEffects>) => void,
): MenuRow[] {
  const number = (
    key: NumberKey,
    label: string,
    values: number[],
    format: (value: number) => string,
    description?: string,
    disabled = false,
  ): MenuRow => ({
    id: `garage-${key}`,
    label,
    description,
    disabled,
    value: format(settings[key]),
    action: (dir) => update({ [key]: cycle(values, settings[key], dir) }),
  });
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const glowOff = contrast || !settings.bloom;
  return [
    {
      id: "garage-theme",
      label: "Garage theme",
      value: settings.theme === "auto" ? "Follow app theme" : UI_THEMES[settings.theme].label,
      action: (dir) => update({ theme: cycle(roomThemes, settings.theme, dir) }),
    },
    {
      id: "garage-bloom",
      label: "Bloom glow",
      value: contrast ? "Off · high contrast" : settings.bloom ? "On" : "Off",
      description:
        "Soft halos around bright garage fixtures. High contrast turns them off.",
      disabled: contrast,
      action: () => update({ bloom: !settings.bloom }),
    },
    number(
      "bloomStrength",
      "Glow strength",
      [0, 0.25, 0.5, 0.75, 1, 1.5],
      percent,
      undefined,
      glowOff,
    ),
    number(
      "bloomRadius",
      "Glow spread",
      [0, 0.15, 0.25, 0.5, 0.75, 1],
      percent,
      undefined,
      glowOff,
    ),
    number(
      "bloomThreshold",
      "Glow threshold",
      [0.5, 0.75, 1, 1.5, 2, 3],
      (value) => value.toFixed(2),
      "Lower values let more lit surfaces glow.",
      glowOff,
    ),
    number(
      "accentBrightness",
      "Neon sign brightness",
      [0, 0.5, 0.75, 1, 1.5, 2, 3],
      percent,
      "Brightness of the theme-colored fixtures and their reflections.",
    ),
    number("rackBrightness", "Left rack bulbs", [0, .25, .5, .75, 1, 1.5, 2], percent),
    number("workBrightness", "Work light bulbs", [0, .25, .5, .75, 1, 1.5, 2], percent),
    number("ceilingBrightness", "Ceiling lights", [0, .25, .5, .75, 1, 1.5, 2], percent),
    number(
      "exposure",
      "Garage exposure",
      [0.5, 0.65, 0.8, 1, 1.25, 1.5],
      percent,
    ),
    {
      id: "garage-environmentReflections",
      label: "Vehicle & wall reflections",
      value: settings.environmentReflections ? "On" : "Off",
      action: () =>
        update({ environmentReflections: !settings.environmentReflections }),
    },
    {
      id: "garage-floorFinish",
      label: "Floor finish",
      value: settings.floorFinish === "metal" ? "Brushed steel" : "Sealed concrete",
      action: () => update({ floorFinish: settings.floorFinish === "metal" ? "concrete" : "metal" }),
    },
    {
      id: "garage-floorReflections",
      label: "Floor reflections",
      value: settings.floorReflections ? "On" : "Off",
      action: () => update({ floorReflections: !settings.floorReflections }),
    },
    number(
      "reflectionStrength",
      "Floor reflectivity",
      [0, 0.25, 0.5, 0.75, 1],
      percent,
      undefined,
      !settings.floorReflections,
    ),
    number(
      "reflectionBlur",
      "Platform reflection softness",
      [0, 0.25, 0.5, 0.75, 1],
      percent,
      undefined,
      !settings.floorReflections,
    ),
    {
      id: "garage-reset",
      label: "Restore garage defaults",
      value: "Reset",
      action: () => update({ ...DEFAULT_GARAGE_EFFECTS }),
    },
  ];
}
