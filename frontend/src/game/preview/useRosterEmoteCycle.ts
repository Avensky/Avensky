import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Object3D } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GARAGE_REST_SECONDS, rosterGarageEmotes, type CreatorEmoteMode } from "../characters/garageEmotes";
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
export function useRosterEmoteCycle(root: Object3D, paused: boolean, personality: CharacterPersonality, bag: boolean, creator?: CreatorEmoteMode) {
  const systemPaused = useSyncExternalStore(subscribePresentation, presentationPaused, () => true);
  const reduced = usePreferencesStore(s => s.reducedMotion);
  const still = paused || reduced || systemPaused;
  const rig = root.uuid;
  const attitude = creator === "basic" ? "neutral" : personality;
  const pool = useMemo(() => rosterGarageEmotes(attitude, bag, creator), [attitude, bag, creator]);
  const [cycle, setCycle] = useState({ rig, pool, turn: 0 });
  const turn = cycle.rig === rig && cycle.pool === pool ? cycle.turn : 0;
  // Two playlists can begin with the same gesture. Give each playback request
  // its own identity while sharing the authored keyframes and compiled clip.
  const request = useMemo(() => ({ rig, emote: { ...pool[turn % pool.length] } }), [rig, pool, turn]);
  const playing = useRef<typeof request | null>(null);
  const timer = useRef<number | null>(null);
  useLayoutEffect(() => {
    playing.current = still ? null : request;
    return () => {
      playing.current = null;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [request, still]);
  const onSelectionEnd = useCallback(() => {
    if (playing.current !== request || timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      if (playing.current !== request) return;
      timer.current = null;
      if (!presentationPaused() && !usePreferencesStore.getState().reducedMotion) {
        setCycle({ rig: request.rig, pool, turn: turn + 1 });
      }
    }, GARAGE_REST_SECONDS * 1000);
  }, [request, pool, turn]);
  return { emote: request.emote, paused: still, onSelectionEnd };
}
