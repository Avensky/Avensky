import { useId } from "react";
import type { HairPalette } from "./fittedWardrobe/hairColors";
import overview from "./bodyArt/body-features.webp";
import complexion from "./bodyArt/body-complexion.webp";
import hair from "./bodyArt/body-hair.webp";
import makeup from "./bodyArt/body-makeup.webp";

type Feature = "hairstyle" | "hair" | "eyes" | "makeup" | "skin" | "brows";
type Sheet = { src: string; columns: number; rows: number };
type Cell = { sheet: Sheet; index: number; reference?: string };
const overviewSheet = { src: overview, columns: 3, rows: 2 };
const hairSheet = { src: hair, columns: 2, rows: 2 };
const skinSheet = { src: complexion, columns: 3, rows: 1 };
const makeupSheet = { src: makeup, columns: 3, rows: 1 };
const overviewIndex: Record<Feature, number> = { hairstyle: 0, hair: 1, eyes: 2, makeup: 3, skin: 4, brows: 5 };

const baseHair = { sheet: hairSheet, index: 0, reference: "#69462f" };
const pigments: Record<string, Cell | undefined> = {
  base: baseHair, presets: baseHair, roots: { sheet: hairSheet, index: 1, reference: "#65432d" },
  highlights: { sheet: hairSheet, index: 2, reference: "#8d6849" }, tips: { sheet: hairSheet, index: 3, reference: "#674831" },
  eye_color: { sheet: skinSheet, index: 0, reference: "#78502c" }, skin: { sheet: skinSheet, index: 1, reference: "#b47859" },
  brow_color: { sheet: skinSheet, index: 2, reference: "#513a2c" },
  makeup: { sheet: makeupSheet, index: 0, reference: "#994f43" }, eyeshadow: { sheet: makeupSheet, index: 1, reference: "#84543e" },
  eyeliner: { sheet: makeupSheet, index: 2 },
};
// Paths follow the lash line of the eyeliner photograph, in its native cell coordinates.
const liners: Record<string, string> = {
  classic: "M71 128 Q120 78 165 107 Q181 116 193 131 Q182 117 160 109 Q121 88 71 128Z",
  "cat-eye": "M71 128 Q117 78 162 104 Q184 119 192 124 Q205 126 226 105 Q210 132 193 133 Q174 113 156 108 Q120 89 71 128Z",
  graphic: "M71 128 Q117 78 162 104 Q184 119 192 124 Q205 126 226 103 Q210 132 193 133 Q174 113 156 108 Q120 89 71 128Z M159 141 Q190 146 214 127 Q192 153 166 147Z",
};

function PresetPigment({ x, y, palette }: { x: number; y: number; palette: HairPalette }) {
  const gradient = useId();
  return <>
    <defs><linearGradient id={gradient} x1="80%" y1="0%" x2="20%" y2="100%">
      <stop stopColor={palette.roots} />
      <stop offset="32%" stopColor={palette.base} />
      <stop offset="54%" stopColor={palette.highlights} stopOpacity={palette.highlightStrength} />
      <stop offset="74%" stopColor={palette.base} />
      <stop offset="100%" stopColor={palette.tips} stopOpacity={palette.tipBlend} />
    </linearGradient></defs>
    <rect x={x} y={y} width="256" height="192" fill={"url(#" + gradient + ")"} />
  </>;
}

/** One cached photograph per material. The transparent pigment matte reveals the requested dye behind it. */
export function BodyFeaturePreview({ feature, channel, tint, option, palette }: {
  feature: Feature; channel?: string; tint?: string; option?: string; palette?: HairPalette;
}) {
  const { sheet, index, reference } = (channel && pigments[channel]) || { sheet: overviewSheet, index: overviewIndex[feature] };
  const x = index % sheet.columns * 256, y = Math.floor(index / sheet.columns) * 192;
  const liner = channel === "eyeliner" && option && liners[option];
  return <svg className="wardrobe-feature-preview" data-body-preview={feature} aria-hidden="true" focusable="false"
    width="100%" height="100%" viewBox={x + " " + y + " 256 192"} preserveAspectRatio="xMidYMid slice"
    style={{ display: "block", pointerEvents: "none" }}>
    {reference && <rect x={x} y={y} width="256" height="192" fill={tint || reference} />}
    {channel === "presets" && palette && <PresetPigment x={x} y={y} palette={palette} />}
    <image href={sheet.src} width={sheet.columns * 256} height={sheet.rows * 192} />
    {liner && <path transform={"translate(" + x + " " + y + ")"} d={liner} fill="#201b1b" />}
  </svg>;
}
