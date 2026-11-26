import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { SkinnedMesh, type Object3D } from "three";
import { useCharacterPreviewStore } from "../characterPreviewStore";
import { prepareDressContactFit } from "./contactFit.mjs";
import { prepareHangingArmClearance } from "./hangingArmClearance.mjs";

export function DressContactMotion({ root, source, active }: {
  root: Object3D;
  source: Object3D | undefined;
  active: boolean;
}) {
  const contact = useRef<ReturnType<typeof prepareDressContactFit>>(undefined);
  const arms = useRef<ReturnType<typeof prepareHangingArmClearance>>(undefined);
  useLayoutEffect(() => {
    if (!active || !source || !("geometry" in source)) return;
    const dress = root.getObjectByName("wardrobe-local-tennis-dress");
    if (!dress) return;
    const fit = prepareDressContactFit(root, (source as SkinnedMesh).geometry, true, dress.userData.tennisContactPoses);
    const body = fit && root.getObjectByName("fitting-room-body");
    const index = body instanceof SkinnedMesh ? body.morphTargetDictionary?.TennisUnderarmFit : undefined;
    const influences = body instanceof SkinnedMesh ? body.morphTargetInfluences : undefined;
    if (influences && index !== undefined) influences[index] = 1;
    contact.current = fit;
    if (fit) arms.current = prepareHangingArmClearance(root);
    return () => {
      fit?.dispose();
      arms.current?.restore();
      arms.current = undefined;
      if (influences && index !== undefined) influences[index] = 0;
      contact.current = undefined;
    };
  }, [root, source, active]);

  useFrame(() => {
    if (!useCharacterPreviewStore.getState().playbackPaused) arms.current?.restore();
  }, -1);

  useFrame(() => {
    const view = useCharacterPreviewStore.getState();
    if (view.playbackPaused) return;
    if (!view.insideCar) arms.current?.apply();
    contact.current?.apply(view.insideCar ? "seated" : view.emote?.id === "walk-casual" ? "walk" : "standing");
  }, 0);
  return null;
}
