import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Object3D } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { SELECTION_POSES } from "../characters/selectionPoses";

const motionQuery = "(prefers-reduced-motion: reduce)";
const NEUTRAL_REST_MS = 4000;

function subscribePresentation(notify: () => void) {
  const media = window.matchMedia?.(motionQuery);
  media?.addEventListener("change", notify);
  document.addEventListener("visibilitychange", notify);
  return () => {
    media?.removeEventListener("change", notify);
    document.removeEventListener("visibilitychange", notify);
  };
}

function presentationPaused() {
  return document.hidden || Boolean(window.matchMedia?.(motionQuery).matches);
}

/** Begin the neutral rest only after the selected rig finishes an entire emote. */
export function useRosterEmoteCycle(root: Object3D, paused: boolean) {
  const systemPaused = useSyncExternalStore(subscribePresentation, presentationPaused, () => true);
  const reduced = usePreferencesStore(s => s.reducedMotion);
  const still = paused || reduced || systemPaused;
  const rig = root.uuid;
  const [cycle, setCycle] = useState({ rig, index: 0 });
  const index = cycle.rig === rig ? cycle.index : 0;
  const timer = useRef<number | null>(null);
  useLayoutEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, [rig, still]);
  const onSelectionEnd = useCallback(() => {
    if (still || timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (!presentationPaused() && !usePreferencesStore.getState().reducedMotion) {
        setCycle({ rig, index: (index + 1) % SELECTION_POSES.length });
      }
    }, NEUTRAL_REST_MS);
  }, [rig, index, still]);
  return { pose: SELECTION_POSES[index].id, paused: still, onSelectionEnd };
}
