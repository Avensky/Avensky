import { HAIR_COLOR_ZONES, type HairColorZone } from "../characters/fittedWardrobe/hairColors";

export type ColorStep = "skin" | "hair" | "eyes" | "makeup" | "brows";
export type ColorChannel = HairColorZone | "brow_color" | "skin" | "eye_color" | "presets" | "makeup" | "eyeshadow" | "eyeliner";
export const colorChannelLabels: Record<ColorChannel, string> = {
  brow_color: "Eyebrow tint", skin: "Skin tone", base: "Base", roots: "Roots", highlights: "Highlights", tips: "Tips", eye_color: "Eye color",
  presets: "Presets", makeup: "Lipstick", eyeshadow: "Eyeshadow", eyeliner: "Eyeliner",
};

const hairChannels = [...HAIR_COLOR_ZONES, "presets"] as const;
const singleHairChannel = ["base"] as const;
const channels = { makeup: ["makeup", "eyeshadow", "eyeliner"], brows: ["brow_color"], skin: ["skin"], eyes: ["eye_color"] } as const;

export function creatorColorChannels(step: ColorStep, style: string): readonly ColorChannel[] {
  if (step === "hair") return style === "cropped" ? singleHairChannel : hairChannels;
  return channels[step];
}
