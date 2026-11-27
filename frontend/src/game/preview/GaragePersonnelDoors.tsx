import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Color, InstancedMesh, Matrix4, Object3D } from "three";
import { garagePaintedFinish } from "./garagePaintedFinish";

export type PersonnelDoorPlacement = {
  /** Floor center on the wall. The local +Z axis faces into the room. */
  position: readonly [number, number, number];
  yaw: number;
};

type Vec3 = readonly [number, number, number];
type Part = { color: string; center: Vec3; size: Vec3; angle?: number };

const frame = "#716c5f", enamel = "#616961", rubber = "#343630", brushed = "#a6a499";
const doorParts: Part[] = [
  { color: rubber, center: [0, 1.05, .024], size: [1.04, 2.1, .048] },
  { color: enamel, center: [0, 1.044, .052], size: [.976, 2.052, .045] },
  { color: frame, center: [-.527, 1.062, .063], size: [.066, 2.124, .12] },
  { color: frame, center: [.527, 1.062, .063], size: [.066, 2.124, .12] },
  { color: frame, center: [0, 2.129, .063], size: [1.12, .068, .12] },
  { color: brushed, center: [0, .159, .080], size: [.91, .249, .008] },
  // A narrow smoked-glass vision panel and its steel surround.
  { color: frame, center: [-.23, 1.57, .082], size: [.224, .58, .016] },
  { color: "#394a45", center: [-.23, 1.57, .093], size: [.178, .533, .012] },
  // Panic hardware stands clear of the leaf.
  { color: rubber, center: [-.37, .994, .113], size: [.116, .118, .077] },
  { color: rubber, center: [.37, .994, .113], size: [.116, .118, .077] },
  { color: brushed, center: [0, .995, .158], size: [.80, .068, .052] },
  ...[.31, 1.15, 1.86].map((y): Part => ({
    color: brushed, center: [.492, y, .082], size: [.024, .104, .026],
  })),
];

// The small illuminated plaque is legible even away from a ceiling fixture.
const ink = "#ebefdb";
const signParts: Part[] = [
  { color: "#3b7057", center: [0, 2.262, .054], size: [.34, .145, .064] },
  { color: ink, center: [-.086, 2.262, .091], size: [.05, .085, .008] },
  { color: ink, center: [.035, 2.262, .091], size: [.077, .013, .008] },
  { color: ink, center: [.003, 2.278, .091], size: [.047, .013, .008], angle: .72 },
  { color: ink, center: [.003, 2.246, .091], size: [.047, .013, .008], angle: -.72 },
];

function DoorParts({ parts, placements, sign = false }: {
  parts: readonly Part[];
  placements: readonly PersonnelDoorPlacement[];
  sign?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const anchor = new Matrix4(), matrix = new Matrix4(), local = new Object3D(), color = new Color();
    let index = 0;
    for (const { position, yaw } of placements) {
      anchor.makeRotationY(yaw).setPosition(...position);
      for (const part of parts) {
        local.position.set(...part.center);
        local.rotation.z = part.angle ?? 0;
        local.scale.set(...part.size);
        local.updateMatrix();
        mesh.setMatrixAt(index, matrix.multiplyMatrices(anchor, local.matrix));
        mesh.setColorAt(index++, color.set(part.color));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [placements, parts, invalidate]);

  return <instancedMesh ref={ref} args={[undefined, undefined, placements.length * parts.length]}
    name={sign ? "garage-personnel-exit-signs" : "garage-personnel-doors"}>
    <boxGeometry />
    {sign ? <meshBasicMaterial /> : <meshStandardMaterial roughness={.56} metalness={.33} emissive="#100e0b" onBeforeCompile={garagePaintedFinish} />}
  </instancedMesh>;
}

/** Two static draws for all of the garage's personnel exits. */
export function GaragePersonnelDoors({ placements }: { placements: readonly PersonnelDoorPlacement[] }) {
  if (!placements.length) return null;
  return <>
    <DoorParts parts={doorParts} placements={placements} />
    <DoorParts parts={signParts} placements={placements} sign />
  </>;
}
