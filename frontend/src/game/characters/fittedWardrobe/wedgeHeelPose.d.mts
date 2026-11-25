import type { Object3D } from "three";
export type WedgePivots = { ankle: [number, number, number]; toes: [number, number, number]; standingAnklePitch: number; standingToePitch: number; lift: number };
export const WEDGE_FIT_PIVOTS: WedgePivots;
export function prepareWedgeHeelPose(root: Object3D, pivots?: WedgePivots): { restore(): void; apply(seated?: boolean): void };
