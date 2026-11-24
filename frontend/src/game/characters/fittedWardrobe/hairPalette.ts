import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const HAIR_COLOR_ZONES = ["base", "roots", "highlights", "tips"] as const;
export type HairColorZone = typeof HAIR_COLOR_ZONES[number];
export type HairPalette = Record<HairColorZone, string> & { highlightStrength: number; tipBlend: number };

const palette = (base: string, roots: string, highlights: string, tips: string, highlightStrength = .4, tipBlend = .6): HairPalette =>
  ({ base, roots, highlights, tips, highlightStrength, tipBlend });

export const HAIR_COLOR_THEMES = {
  Espresso: palette("#533a30", "#38271f", "#805a44", "#594033", .33, .38),
  "Soft Black": palette("#252226", "#151419", "#48414b", "#322b35"),
  "Cool Brunette": palette("#59473f", "#342b29", "#8b7469", "#70605b"),
  "Warm Chestnut": palette("#654231", "#3d2924", "#a67550", "#825136"),
  "Caramel Balayage": palette("#805538", "#432c24", "#d59d5f", "#bc824b", .57, .83),
  "Honey Blonde": palette("#af844f", "#66462f", "#e5bf81", "#cfa366", .5, .72),
  "Platinum Smoke": palette("#cbc7c2", "#59535c", "#f2ece2", "#9b9cae", .45, .75),
  "Silver Fox": palette("#8e929c", "#41444d", "#d1d7de", "#b0b6c2", .52, .65),
  "Bright Copper": palette("#a74b2a", "#622b24", "#e89457", "#c86537"),
  "Scarlet Red": palette("#ad2427", "#65151d", "#ef5350", "#d23135", .53, .66),
  "Copper Auburn": palette("#8e362a", "#4c2321", "#d4693e", "#b85331", .46, .72),
  "Strawberry Blonde": palette("#bf765b", "#8a4234", "#f1b780", "#e9a16e", .58, .76),
  "Black Cherry": palette("#651c31", "#29131f", "#bb3d52", "#a62946", .49, .82),
  "Red to Rose": palette("#a82d3a", "#561c30", "#ea776b", "#dc6e9e", .56, .92),
  "Wine Velvet": palette("#6d2744", "#301927", "#bd5775", "#831c3b", .59, .72),
  "Midnight Teal": palette("#23616b", "#182639", "#64cfbb", "#1b8b84", .62, .75),
  "Icy Blue": palette("#5987b3", "#293c68", "#b4e3ee", "#7ecddc", .55, .78),
  "Violet Dusk": palette("#633c80", "#2d1c4c", "#af7bc2", "#ac3e86", .62, .8),
  "Rose Quartz": palette("#b76888", "#613858", "#f6c9ca", "#e694a6", .54, .79),
  "Peacock": palette("#2b535e", "#241f49", "#67bc9c", "#6860ba", .66, .82),
  "Sunset Fade": palette("#ad462e", "#4b1d37", "#ffae55", "#d85391", .58, .88),
} satisfies Record<string, HairPalette>;

export const DEFAULT_HAIR_PALETTE = HAIR_COLOR_THEMES.Espresso;
export const HAIR_PALETTE_STORAGE = "avensky-local-hair-palette-v1";

const isHex = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const strength = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value)
  ? Math.max(0, Math.min(1, value)) : fallback;

export function normalizeHairPalette(value: unknown): HairPalette {
  const source = value && typeof value === "object" ? value as Partial<HairPalette> : {};
  const result = { ...DEFAULT_HAIR_PALETTE };
  for (const zone of HAIR_COLOR_ZONES) {
    if (isHex(source[zone])) result[zone] = source[zone].toLowerCase();
  }
  result.highlightStrength = strength(source.highlightStrength, result.highlightStrength);
  result.tipBlend = strength(source.tipBlend, result.tipBlend);
  return result;
}

export const useHairPaletteStore = create<{ palette: HairPalette; original: boolean; setPalette: (palette: HairPalette) => void; reset: () => void }>()(
  persist(set => ({
    palette: DEFAULT_HAIR_PALETTE,
    original: true,
    setPalette: value => set({ palette: normalizeHairPalette(value), original: false }),
    reset: () => set({ palette: DEFAULT_HAIR_PALETTE, original: true }),
  }), {
    name: HAIR_PALETTE_STORAGE,
    storage: createJSONStorage(() => localStorage),
    partialize: state => ({ palette: state.palette, original: state.original }),
    merge: (saved, state) => ({
      ...state,
      original: (saved as { original?: unknown } | undefined)?.original !== false,
      palette: normalizeHairPalette((saved as { palette?: unknown } | undefined)?.palette),
    }),
  }),
);
