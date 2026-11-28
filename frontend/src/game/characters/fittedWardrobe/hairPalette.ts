import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_HAIR_PALETTE, normalizeHairPalette, type HairPalette } from "./hairColors";
import { normalizeHairGroom, type HairGroom } from "./hairGroom";

export * from "./hairColors";
export const HAIR_PALETTE_STORAGE = "avensky-local-hair-palette-v1";

export const useHairPaletteStore = create<{
  palette: HairPalette;
  original: boolean;
  grooms: Record<string, HairGroom>;
  setPalette: (palette: HairPalette) => void;
  setGroom: (style: string, groom: HairGroom) => void;
  reset: () => void;
}>()(
  persist(set => ({
    palette: DEFAULT_HAIR_PALETTE,
    original: true,
    grooms: {},
    setPalette: value => set({ palette: normalizeHairPalette(value), original: false }),
    setGroom: (style, groom) => set(state => ({ grooms: { ...state.grooms, [style]: normalizeHairGroom(groom) } })),
    reset: () => set({ palette: DEFAULT_HAIR_PALETTE, original: true }),
  }), {
    name: HAIR_PALETTE_STORAGE,
    storage: createJSONStorage(() => localStorage),
    partialize: state => ({ palette: state.palette, original: state.original, grooms: state.grooms }),
    merge: (saved, state) => {
      const data = saved as { original?: unknown; palette?: unknown; grooms?: Record<string, unknown> } | undefined;
      return {
        ...state,
        original: data?.original !== false,
        palette: normalizeHairPalette(data?.palette),
        grooms: Object.fromEntries(Object.entries(data?.grooms ?? {}).filter(([id]) => /^[\w-]{1,40}$/.test(id))
          .map(([id, groom]) => [id, normalizeHairGroom(groom)])),
      };
    },
  }),
);
