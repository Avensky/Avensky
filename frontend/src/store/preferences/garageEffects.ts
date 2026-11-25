import { DEFAULT_GARAGE_THEME } from "../../theme/garageEntry.ts";
import { isUITheme, type GarageTheme } from "../../theme/catalog.ts";

/** Presentation for the selection garage only. Driving keeps its own renderer. */
export type GarageEffects = {
  theme: GarageTheme;
  floorFinish: "concrete" | "metal";
  bloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  accentBrightness: number;
  exposure: number;
  rackBrightness: number;
  workBrightness: number;
  ceilingBrightness: number;
  environmentReflections: boolean;
  floorReflections: boolean;
  reflectionStrength: number;
  reflectionBlur: number;
};

export const DEFAULT_GARAGE_EFFECTS: GarageEffects = {
  theme: DEFAULT_GARAGE_THEME,
  floorFinish: "concrete",
  bloom: true,
  bloomStrength: 0.5,
  bloomRadius: 0.25,
  bloomThreshold: 1,
  accentBrightness: 1,
  exposure: 0.8,
  rackBrightness: 1,
  workBrightness: 1,
  ceilingBrightness: 1,
  environmentReflections: true,
  floorReflections: true,
  reflectionStrength: 1,
  reflectionBlur: 0.25,
};

export function sanitizeGarageEffects(value: unknown): GarageEffects {
  const data =
    value && typeof value === "object" ? (value as Partial<GarageEffects>) : {};
  const number = (key: keyof GarageEffects, min: number, max: number) =>
    typeof data[key] === "number" && Number.isFinite(data[key])
      ? Math.min(max, Math.max(min, data[key] as number))
      : (DEFAULT_GARAGE_EFFECTS[key] as number);
  const flag = (key: keyof GarageEffects) =>
    typeof data[key] === "boolean"
      ? (data[key] as boolean)
      : (DEFAULT_GARAGE_EFFECTS[key] as boolean);
  return {
    theme: data.theme === "auto" || isUITheme(data.theme) ? data.theme : DEFAULT_GARAGE_EFFECTS.theme,
    floorFinish: data.floorFinish === "metal" ? "metal" : "concrete",
    bloom: flag("bloom"),
    bloomStrength: number("bloomStrength", 0, 1.5),
    bloomRadius: number("bloomRadius", 0, 1),
    bloomThreshold: number("bloomThreshold", 0, 3),
    accentBrightness: number("accentBrightness", 0, 3),
    exposure: number("exposure", 0.5, 1.5),
    rackBrightness: number("rackBrightness", 0, 2),
    workBrightness: number("workBrightness", 0, 2),
    ceilingBrightness: number("ceilingBrightness", 0, 2),
    environmentReflections: flag("environmentReflections"),
    floorReflections: flag("floorReflections"),
    reflectionStrength: number("reflectionStrength", 0, 1),
    reflectionBlur: number("reflectionBlur", 0, 1),
  };
}
