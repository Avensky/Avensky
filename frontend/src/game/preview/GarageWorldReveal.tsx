import { useLayoutEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useUIStore } from "../../store/menus/uiStore";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useSelectionStore } from "../../store/selection/selectionStore";
import { useWorldStore } from "../../store/world/worldStore";
import { useGarageParking } from "./garageParkingStore";

/** Mounted inside the live world's Suspense boundary. The garage remains the
 * visible surface until the frame containing the admitted map has been drawn. */
export function GarageWorldReveal({ surface }: { surface: RefObject<HTMLDivElement | null> }) {
  const mapId = useWorldStore(state => state.map?.map_id);
  const destination = useSelectionStore(state => state.getSelectedMap().id);
  const ready = useRef(false);
  const frame = useRef(0);
  const fade = useRef<Animation | undefined>(undefined);
  useLayoutEffect(() => {
    ready.current = false;
    return () => {
      cancelAnimationFrame(frame.current);
      if (fade.current) {
        fade.current.onfinish = null;
        fade.current.cancel();
        fade.current = undefined;
      }
    };
  }, []);

  useFrame(() => {
    if (ready.current || !mapId || mapId !== destination) return;
    ready.current = true;
    // Run on the next display tick, after R3F's render/composer for this one.
    frame.current = requestAnimationFrame(() => {
      const finish = () => {
        if (useUIStore.getState().isModeLoading) useUIStore.getState().finishModeLoading();
        useGarageParking.getState().completeDeparture();
      };
      const reduced = usePreferencesStore.getState().reducedMotion ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || !surface.current?.animate) {
        finish();
        return;
      }
      fade.current = surface.current.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 260, easing: "ease-out", fill: "forwards",
      });
      fade.current.onfinish = finish;
    });
  });
  return null;
}
