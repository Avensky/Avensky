import { normalizeHairPalette, type HairPalette } from "./hairColors";

// This order is the piece index written by the groom exporter.
export const HAIR_PIECES = [
  ["crown", "Crown"], ["bangs", "Bangs"], ["left-side", "Left side"], ["right-side", "Right side"],
  ["left-braid", "Left braid"], ["right-braid", "Right braid"], ["nape", "Nape"], ["bun", "Bun"], ["ponytail", "Ponytail"],
] as const;
export type HairPiece = typeof HAIR_PIECES[number][0];
export type HairGroom = {
  pieces: Partial<Record<HairPiece, HairPalette>>;
  volume: number;
  thickness: number;
};
export const DEFAULT_HAIR_GROOM: HairGroom = { pieces: {}, volume: 0, thickness: 0 };

// Swatches from the source look's color ramps, expressed as sRGB for the
// same pickers and blends used by the rest of Avensky's hair palettes.
function groomTheme(roots: string, base: string, tips: string): HairPalette {
  return { roots, base, highlights: tips, tips, highlightStrength: .46, tipBlend: .84 };
}

export const BRAIDED_PONYTAIL_THEMES = {
  "Mocha Black Tea": groomTheme("#18100b", "#302116", "#3f2e22"),
  "Blue-Black Gradient": groomTheme("#0b1118", "#1c2b3d", "#273a52"),
  "Cool Platinum Blonde": groomTheme("#81817d", "#a8aaad", "#c4c6ca"),
  "Milk Tea Blonde": groomTheme("#85735c", "#ac9378", "#c5ac8e"),
  "Caramel Flax Brown": groomTheme("#5f4934", "#977756", "#bc956a"),
  "Light Chestnut": groomTheme("#523a2f", "#826253", "#a27c6a"),
  "Obsidian Black": groomTheme("#050607", "#141518", "#1d1e21"),
  "Dark Ash Flax": groomTheme("#323437", "#54595e", "#696e73"),
  "Cool Ash Brown": groomTheme("#4d4842", "#777065", "#958d81"),
  "Bleached Light Blonde": groomTheme("#998565", "#c9af87", "#e5cb9e"),
  "Red and Sand Two-Tone": groomTheme("#620405", "#765645", "#948873"),
  "Black Tea Brown": groomTheme("#18120e", "#412e22", "#896148"),
} satisfies Record<string, HairPalette>;

function clamp(value: unknown, min: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(1, value)) : 0;
}

export function normalizeHairGroom(value: unknown): HairGroom {
  if (!value || typeof value !== "object") return DEFAULT_HAIR_GROOM;
  const source = value as Partial<HairGroom>;
  const pieces: HairGroom["pieces"] = {};
  for (const [piece] of HAIR_PIECES) {
    const palette = source.pieces?.[piece];
    if (palette && typeof palette === "object") pieces[piece] = normalizeHairPalette(palette);
  }
  return { pieces, volume: clamp(source.volume, 0), thickness: clamp(source.thickness, -1) };
}
