import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Object3D } from "three";
import { prepareWedgeHeelPose } from "./wedgeHeelPose.mjs";
import { useCharacterPreviewStore } from "../characterPreviewStore";

export function WedgeSandalMotion({ root, active }: { root: Object3D; active: boolean }) {
  const motion = useRef<{ restore: () => void; apply: () => void } | undefined>(undefined);
  useLayoutEffect(() => {
    if (!active || !root.getObjectByName("wardrobe-local-wave-wedges")) return;
    const pose = prepareWedgeHeelPose(root);
    motion.current = pose;
    return () => { pose.restore(); motion.current = undefined; };
  }, [root, active]);

  // Restore the animation pose before the mixer and cockpit IK run. A resting
  // ankle may receive no track update, so applying on top of last frame spins it.
  useFrame(() => motion.current?.restore(), -1);
  useFrame(() => {
    if (!useCharacterPreviewStore.getState().insideCar) motion.current?.apply();
  }, 0);
  return null;
}
