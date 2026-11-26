import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_HAIR_PALETTE, normalizeHairPalette, type HairPalette } from "./hairColors";

export * from "./hairColors";
export const HAIR_PALETTE_STORAGE = "avensky-local-hair-palette-v1";

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
