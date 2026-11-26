import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { GarageMaterialization } from "../preview/GarageMaterialization";
import type { WardrobePreview } from "./wardrobePreviewAssets";

const midpoint = .42;

export function RosterRigHandoff({ preview, requested, creating, children }: {
  preview: WardrobePreview; requested: string; creating: boolean;
  children: (shown: WardrobePreview, coverage: { value: number }) => ReactNode;
}) {
  const motionPreference = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)"), []);
  const reduced = usePreferencesStore(s => s.reducedMotion);
  const freshEntry = creating && !reduced && !motionPreference?.matches;
  const [shown, setShown] = useState(preview);
  const [playing, setPlaying] = useState(freshEntry);
  const entered = useRef(freshEntry);
  const progress = useRef(freshEntry ? midpoint : -1);
  const coverage = useRef({ value: freshEntry ? .05 : 1 }).current;
  const invalidate = useThree(s => s.invalidate);
  const candidate = preview.look.character.id;
  const current = shown.look.character.id;
  useLayoutEffect(() => {
    if (!creating) entered.current = false;
    if (candidate !== requested) return;
    const swap = candidate !== current;
    const intro = creating && !entered.current;
    if (reduced || motionPreference?.matches) {
      coverage.value = 1;
      if (playing) setPlaying(false);
      entered.current = creating;
      setShown(preview);
    } else if (!playing && (swap || intro)) {
      entered.current = creating;
      progress.current = 0;
      setPlaying(true);
      invalidate();
    } else if (!swap && shown !== preview) {
      // Swatches and outfits take effect immediately on the displayed rig.
      setShown(preview);
    }
  }, [preview, shown, candidate, current, requested, creating, playing, reduced, motionPreference, invalidate, coverage]);

  useFrame((_, delta) => {
    if (!playing) return;
    const last = progress.current;
    const t = reduced || motionPreference?.matches ? 1 : Math.min(1, last + Math.min(.075, delta) / .72);
    progress.current = t;
    const visibility = t < midpoint ? 1 - MathUtils.smoothstep(t, 0, midpoint) : MathUtils.smoothstep(t, midpoint, 1);
    coverage.value = .05 + .95 * visibility;
    if (last < midpoint && t >= midpoint && candidate === requested) setShown(preview);
    if (t === 1) setPlaying(false);
    invalidate();
  }, -1.5);

  return <>
    {children(shown, coverage)}
    {progress.current >= 0 && <GarageMaterialization active={playing} subject="character" progress={progress} footprint={[.82, .72]} offset={[0, 0]} />}
  </>;
}
