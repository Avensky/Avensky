import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { SkinnedMesh, type Object3D } from "three";
import { prepareWedgeHeelPose, WEDGE_FIT_PIVOTS } from "./wedgeHeelPose.mjs";
import { useCharacterPreviewStore } from "../characterPreviewStore";

export function WedgeSandalMotion({ root, active }: { root: Object3D; active: boolean }) {
  const motion = useRef<ReturnType<typeof prepareWedgeHeelPose> | undefined>(undefined);
  const ankleFit = useRef<{ influences: number[]; index: number } | undefined>(undefined);
  useLayoutEffect(() => {
    if (!active || !root.getObjectByName("wardrobe-local-wave-wedges")) return;
    const body = root.getObjectByName("fitting-room-body");
    const influences = body instanceof SkinnedMesh ? body.morphTargetInfluences : undefined;
    const fit = body instanceof SkinnedMesh ? body.morphTargetDictionary?.WedgeFootFit : undefined;
    const pose = prepareWedgeHeelPose(root, fit !== undefined ? WEDGE_FIT_PIVOTS : undefined);
    const previous = influences && fit !== undefined ? influences[fit] : undefined;
    const ankleIndex = body instanceof SkinnedMesh ? body.morphTargetDictionary?.WedgeAnkleClearance : undefined;
    const previousAnkle = influences && ankleIndex !== undefined ? influences[ankleIndex] : undefined;
    if (influences && fit !== undefined) influences[fit] = 1;
    if (influences && ankleIndex !== undefined) ankleFit.current = { influences, index: ankleIndex };
    motion.current = pose;
    return () => {
      if (influences && fit !== undefined && previous !== undefined) influences[fit] = previous;
      if (influences && ankleIndex !== undefined && previousAnkle !== undefined) influences[ankleIndex] = previousAnkle;
      ankleFit.current = undefined;
      pose.restore();
      motion.current = undefined;
    };
  }, [root, active]);

  // Restore the animation pose before the mixer and cockpit IK run. A resting
  // ankle may receive no track update, so applying on top of last frame spins it.
  useFrame(() => motion.current?.restore(), -1);
  useFrame(() => {
    const seated = useCharacterPreviewStore.getState().insideCar;
    const ankle = ankleFit.current;
    if (ankle) ankle.influences[ankle.index] = seated ? 1 : 0;
    if (!seated || ankle) motion.current?.apply(seated);
  }, 0);
  return null;
}
