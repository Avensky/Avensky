import type { BufferGeometry, Object3D } from "three";
export function prepareDressContactFit(root: Object3D, bodySource: BufferGeometry, roundedLeftCuff?: boolean):
  { apply(pose: "standing" | "walk" | "seated"): void; dispose(): void } | undefined;
