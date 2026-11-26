import type { BufferGeometry, Object3D } from "three";
type Mode = "standing" | "walk" | "seated";
type ContactPoses = Partial<Record<Mode, { pose: number[]; moves: number[] }[]>>;

export function prepareDressContactFit(root: Object3D, bodySource: BufferGeometry, roundedLeftCuff?: boolean, baked?: ContactPoses):
  { apply(pose: "standing" | "walk" | "seated"): void; dispose(): void } | undefined;
