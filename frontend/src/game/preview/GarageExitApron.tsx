import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, Group, InstancedMesh, Matrix4 } from "three";
import { garageBayOpening } from "./garageBayMotion";
import { GARAGE_BAY_DOORS, GARAGE_ENTRY_BAY } from "./garageDoorLayout";

type Box = [x: number, y: number, z: number, width: number, height: number, depth: number, color: string];
const threshold = GARAGE_ENTRY_BAY.position[2];
const yard: Box[] = [
  // Extend the slab under the shutter sill and along the entire departure lane.
  [0, -.091, threshold + 37, 96, .16, 75, "#626261"],
  [-7.9, .22, threshold + 10, .35, .44, 21, "#89877f"],
  [9.5, .22, threshold + 10, .35, .44, 21, "#89877f"],
];
// The far edge of the service yard gives the open door a horizon at dusk.
for (const [x, z, w, h] of [[-22, 49, 21, 4.4], [16, 55, 16, 5.6], [34, 47, 13, 4.3]]) {
  yard.push([x, h / 2, z, w, h, 9, "#62676a"], [x, h + .08, z, w + .32, .16, 9.25, "#474e53"]);
  for (let dx = 1.1; dx < w - 1; dx += 2.7)
    yard.push([x - w / 2 + dx, h * .66, z - 4.53, 1.28, .72, .07, "#a19c88"]);
}
for (const x of [-7.9, 9.5]) for (const z of [2.5, 6.8, 11.2]) {
  yard.push([x, .5, threshold + z, .14, 1, .14, "#ad9976"]);
}

/** A continuous outside floor and visible yard until the server confirms the Harbor spawn. */
export function GarageExitApron({ driving }: { driving: boolean }) {
  const group = useRef<Group>(null);
  useFrame(({ camera }) => {
    if (group.current) {
      group.current.visible = driving || camera.position.z >= threshold ||
        GARAGE_BAY_DOORS.some((_, i) => garageBayOpening(i) > 0);
    }
  }, -.3);
  const mesh = useRef<InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const batch = mesh.current;
    if (!batch) return;
    const matrix = new Matrix4(), tint = new Color();
    yard.forEach(([x,y,z,w,h,d,color], i) => {
      batch.setMatrixAt(i, matrix.makeScale(w,h,d).setPosition(x,y,z));
      batch.setColorAt(i, tint.set(color));
    });
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    batch.computeBoundingSphere();
    invalidate();
  }, [invalidate]);
  return <group name="garage-departure-yard" ref={group} visible={driving}>
    <instancedMesh ref={mesh} args={[undefined, undefined, yard.length]}><boxGeometry /><meshBasicMaterial /></instancedMesh>
    <mesh position={[0, 17.9, 79]} rotation-y={Math.PI} renderOrder={-1}>
      <planeGeometry args={[180, 36]} /><meshBasicMaterial color="#8c9298" />
    </mesh>
  </group>;
}
