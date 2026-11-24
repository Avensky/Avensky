import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Object3D, SkinnedMesh } from "three";
import { useCharacterPreviewStore } from "../characterPreviewStore";
import { prepareDressContactFit } from "./contactFit.mjs";

export function DressContactMotion({ root, source, active }: {
  root: Object3D;
  source: Object3D | undefined;
  active: boolean;
}) {
  const contact = useRef<ReturnType<typeof prepareDressContactFit>>(undefined);
  useLayoutEffect(() => {
    if (!active || !source || !("geometry" in source)) return;
    const fit = prepareDressContactFit(root, (source as SkinnedMesh).geometry);
    contact.current = fit;
    return () => {
      fit?.dispose();
      contact.current = undefined;
    };
  }, [root, source, active]);

  useFrame(() => {
    const view = useCharacterPreviewStore.getState();
    if (view.playbackPaused) return;
    contact.current?.apply(view.insideCar ? "seated" : view.emote?.id === "walk-casual" ? "walk" : "standing");
  }, 0);
  return null;
}
