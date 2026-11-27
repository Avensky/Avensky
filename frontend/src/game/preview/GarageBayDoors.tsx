import { Suspense, useLayoutEffect, useRef } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import {
  Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";

export type GarageBayPlacement = {
  /** Floor center of the shutter. Local +Z faces into the room. */
  position: readonly [number, number, number];
  yaw: number;
  /** Clear opening in metres, excluding the 12 cm jambs and 20 cm header. */
  width?: number;
  height?: number;
};

type Props = { bays: readonly GarageBayPlacement[] };
const shutterUrl = "/open-art/garage/garage-door/garage-door.gltf";
const donorWidth = 2.60, donorHeight = 2.967;

function positionDoor(door: Object3D, bay: GarageBayPlacement) {
  door.position.set(...bay.position);
  door.rotation.y = bay.yaw;
  door.updateMatrix();
}

function GarageBayFrames({ bays }: Props) {
  const frames = useRef<InstancedMesh>(null);
  const lamps = useRef<InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const frame = frames.current, lamp = lamps.current;
    if (!frame || !lamp) return;
    const door = new Object3D(), part = new Object3D(), matrix = new Matrix4(), tint = new Color();
    function place(mesh: InstancedMesh, i: number, x: number, y: number, z: number,
      w: number, h: number, d: number, angle = 0) {
      part.position.set(x, y, z);
      part.rotation.z = angle;
      part.scale.set(w, h, d);
      part.updateMatrix();
      mesh.setMatrixAt(i, matrix.multiplyMatrices(door.matrix, part.matrix));
    }
    bays.forEach((bay, i) => {
      positionDoor(door, bay);
      const w = bay.width ?? donorWidth, h = bay.height ?? donorHeight;
      const first = i * 4;
      // Backing closes the bay even while the donor loads or if its request fails.
      place(frame, first, 0, h / 2, -.13, w, h, .12);
      frame.setColorAt(first, tint.set("#343839"));
      for (const [j, side] of [-1, 1].entries()) {
        place(frame, first + j + 1, side * (w / 2 + .06), h / 2, -.01, .12, h, .20);
        frame.setColorAt(first + j + 1, tint.set("#8f8580"));
      }
      place(frame, first + 3, 0, h + .10, -.01, w + .24, .20, .22);
      frame.setColorAt(first + 3, tint.set("#554f48"));
      place(lamp, i, 0, h + .08, .13, .054, w * .56, .054, Math.PI / 2);
    });
    frame.instanceMatrix.needsUpdate = true;
    if (frame.instanceColor) frame.instanceColor.needsUpdate = true;
    lamp.instanceMatrix.needsUpdate = true;
    frame.computeBoundingSphere();
    lamp.computeBoundingSphere();
    invalidate();
  }, [bays, invalidate]);
  return <>
    <instancedMesh ref={frames} name="garage-bay-frames" args={[undefined, undefined, bays.length * 4]}>
      <boxGeometry />
      <meshStandardMaterial metalness={.30} roughness={.55} emissive="#171511" />
    </instancedMesh>
    <instancedMesh ref={lamps} name="garage-bay-lamps" args={[undefined, undefined, bays.length]}>
      <cylinderGeometry args={[.5, .5, 1, 8]} />
      <meshBasicMaterial color="#ffe3b5" />
    </instancedMesh>
  </>;
}

// A ribbed shutter remains in the room before the textured mesh is requested.
function GarageBaySlats({ bays }: Props) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  const courses = 18;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const door = new Object3D(), slat = new Object3D(), matrix = new Matrix4();
    slat.rotation.x = -.14;
    bays.forEach((bay, i) => {
      positionDoor(door, bay);
      const pitch = (bay.height ?? donorHeight) / courses;
      slat.scale.set(bay.width ?? donorWidth, pitch - .007, .04);
      for (let j = 0; j < courses; j++) {
        slat.position.set(0, (j + .5) * pitch, -.03);
        slat.updateMatrix();
        mesh.setMatrixAt(i * courses + j, matrix.multiplyMatrices(door.matrix, slat.matrix));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [bays, invalidate]);
  return <instancedMesh ref={ref} name="garage-bay-slats" args={[undefined, undefined, bays.length * courses]}>
    <boxGeometry />
    <meshStandardMaterial color="#727674" emissive="#33312d" metalness={.42} roughness={.68} />
  </instancedMesh>;
}

function GarageBayShutters({ bays }: Props) {
  // Its external JPEGs and plain geometry work with the entry scene’s existing loader.
  const { scene } = useLoader(GLTFLoader, shutterUrl);
  const host = useRef<Group>(null);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const parent = host.current;
    // The fitted donor is one static mesh with one galvanized finish.
    const source = scene.getObjectByProperty("isMesh", true);
    if (!parent || !(source instanceof Mesh) || !(source.material instanceof MeshStandardMaterial)) return;
    const finish = source.material.clone();
    finish.emissiveMap = finish.map;
    finish.emissive.setRGB(.46, .39, .31);
    const shutters = new InstancedMesh(source.geometry, finish, bays.length);
    shutters.name = "garage-bay-shutters";
    source.updateWorldMatrix(true, false);
    const door = new Object3D(), matrix = new Matrix4();
    bays.forEach((bay, i) => {
      door.scale.set((bay.width ?? donorWidth) / donorWidth, (bay.height ?? donorHeight) / donorHeight, 1);
      positionDoor(door, bay);
      shutters.setMatrixAt(i, matrix.multiplyMatrices(door.matrix, source.matrixWorld));
    });
    shutters.instanceMatrix.needsUpdate = true;
    shutters.computeBoundingSphere();
    parent.add(shutters);
    invalidate();
    return () => {
      parent.remove(shutters);
      shutters.dispose();
      finish.dispose();
      invalidate();
    };
  }, [scene, bays, invalidate]);
  return <group ref={host} />;
}

export function GarageBayDoors({ bays, detailed = true }: Props & { detailed?: boolean }) {
  if (!bays.length) return null;
  const slats = <GarageBaySlats bays={bays} />;
  return <group name="garage-bay-doors">
    <GarageBayFrames bays={bays} />
    {detailed ? <AssetBoundary resetKey={shutterUrl} fallback={slats}>
      <Suspense fallback={slats}><GarageBayShutters bays={bays} /></Suspense>
    </AssetBoundary> : slats}
  </group>;
}
