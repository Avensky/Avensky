import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Object3D } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GARAGE_REST_SECONDS, rosterGarageEmotes } from "../characters/garageEmotes";
import type { CharacterPersonality } from "../characters/characterPersonality";

const motionQuery = "(prefers-reduced-motion: reduce)";

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
export function useRosterEmoteCycle(root: Object3D, paused: boolean, personality: CharacterPersonality, bag: boolean) {
  const systemPaused = useSyncExternalStore(subscribePresentation, presentationPaused, () => true);
  const reduced = usePreferencesStore(s => s.reducedMotion);
  const still = paused || reduced || systemPaused;
  const rig = root.uuid;
  const pool = useMemo(() => rosterGarageEmotes(personality, bag), [personality, bag]);
  const [cycle, setCycle] = useState({ rig, pool, index: 0 });
  const index = cycle.rig === rig && cycle.pool === pool ? cycle.index : 0;
  const timer = useRef<number | null>(null);
  useLayoutEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, [rig, pool, still]);
  const onSelectionEnd = useCallback(() => {
    if (still || timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (!presentationPaused() && !usePreferencesStore.getState().reducedMotion) {
        setCycle({ rig, pool, index: (index + 1) % pool.length });
      }
    }, GARAGE_REST_SECONDS * 1000);
  }, [rig, pool, index, still]);
  return { emote: pool[index], paused: still, onSelectionEnd };
}
