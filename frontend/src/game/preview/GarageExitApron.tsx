import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, Group, InstancedMesh, Matrix4 } from "three";
import { garageBayOpening } from "./garageBayMotion";
import { GARAGE_BAY_DOORS, GARAGE_ENTRY_BAY } from "./garageDoorLayout";

type Box = [x: number, y: number, z: number, width: number, height: number, depth: number, color: string];
const threshold = GARAGE_ENTRY_BAY.position[2];
const yard: Box[] = [
  // Extend the slab under the shutter sill and along the entire departure lane.
  [0, -.091, threshold + 37, 96, .16, 75, "#514f4d"],
  [-7.9, .22, threshold + 10, .35, .44, 21, "#89877f"],
  [9.5, .22, threshold + 10, .35, .44, 21, "#89877f"],
];
// The high chase shot sees the concrete first. Transverse joints and wheel wear
// make the open threshold readable even before the skyline comes into view.
const slabs = [
  ["#494643", "#44423f"], ["#55524f", "#4e4b48"], ["#5e5b57", "#575551"],
  ["#65615d", "#5f5c59"], ["#686561", "#64615d"],
];
for (let row = 0; row < slabs.length; row++) {
  const z = threshold + row * 3.8;
  yard.push([.8, -.010, z + 1.90, 18, .006, 3.77, slabs[row][0]]);
  yard.push([.8, -.005, z, 18, .006, .035, "#363633"]);
  for (const bay of GARAGE_BAY_DOORS) {
    const x = bay.position[0];
    for (const side of [-1, 1]) {
      yard.push([x + .78 * side, -.004, z + 1.90, .20, .004, 3.66, slabs[row][1]]);
    }
  }
}
// A narrow slotted drain runs across all three entries just outside the threshold.
yard.push([.8, -.004, threshold + .45, 17.6, .008, .21, "#343735"]);
for (let x = -7.9; x <= 9.5; x += .23) {
  yard.push([x, .002, threshold + .45, .075, .003, .195, "#686661"]);
}
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
