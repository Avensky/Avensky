import type { BufferGeometry, Object3D } from "three";
export function prepareDressContactFit(root: Object3D, bodySource: BufferGeometry):
  { apply(pose: "standing" | "walk" | "seated"): void; dispose(): void } | undefined;
