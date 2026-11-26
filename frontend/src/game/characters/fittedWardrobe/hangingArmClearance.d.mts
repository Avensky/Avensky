import type { Object3D } from "three";

export function prepareHangingArmClearance(root: Object3D): { apply(): void; restore(): void };
