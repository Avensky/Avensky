import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, Frustum, Group, InstancedMesh, Matrix4, Vector3, type Material } from "three";
import { GarageBayDoors } from "./GarageBayDoors";
import { GaragePersonnelDoors } from "./GaragePersonnelDoors";
import { GARAGE_BAY_DOORS, GARAGE_PERSONNEL_DOORS, garageDoorWallBounds, garageDoorWallPanels } from "./garageDoorLayout";

const bounds = new Box3(new Vector3(...garageDoorWallBounds.min), new Vector3(...garageDoorWallBounds.max));

export function GarageDoorWall({ surface, detailed, cullOutsideShot = false }: { surface?: Material; detailed: boolean; cullOutsideShot?: boolean }) {
  const group = useRef<Group>(null);
  const view = useMemo(() => ({ valid: false, frustum: new Frustum(), projection: new Matrix4(), previous: new Matrix4() }), []);
  useFrame(({ camera }) => {
    if (!group.current || !cullOutsideShot) return;
    camera.updateWorldMatrix(true, false);
    view.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (view.valid && view.previous.equals(view.projection)) return;
    view.valid = true;
    view.previous.copy(view.projection);
    group.current.visible = view.frustum.setFromProjectionMatrix(view.projection).intersectsBox(bounds);
  }, -.4);
  // Vehicle mode can use other cameras for reflections, which need their own frustum.
  useLayoutEffect(() => {
    view.valid = false;
    if (group.current) group.current.visible = true;
  }, [view, cullOutsideShot]);
  const infill = useRef<InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const wall = infill.current;
    if (!wall) return;
    const matrix = new Matrix4();
    garageDoorWallPanels.forEach(({ center, size }, i) => {
      matrix.makeScale(...size).setPosition(...center);
      wall.setMatrixAt(i, matrix);
    });
    wall.instanceMatrix.needsUpdate = true;
    wall.computeBoundingSphere();
    invalidate();
  }, [invalidate]);
  return <group ref={group} name="garage-door-wall">
    <instancedMesh ref={infill} name="garage-bay-wall-infill" args={[undefined, undefined, garageDoorWallPanels.length]} material={surface}>
      <boxGeometry />
      {!surface && <meshStandardMaterial color="#4e4840" roughness={.78} />}
    </instancedMesh>
    <GarageBayDoors bays={GARAGE_BAY_DOORS} detailed={detailed} />
    <GaragePersonnelDoors placements={GARAGE_PERSONNEL_DOORS} />
  </group>;
}
