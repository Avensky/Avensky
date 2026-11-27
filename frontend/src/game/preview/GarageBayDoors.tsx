import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  Color, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, type BufferGeometry,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { garageBayMotion } from "./garageBayMotion";
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
// The donor's two narrow side tabs extend to 2.967 m. Its full-width sheet ends at 2.84 m.
const donorWidth = 2.60, donorHeight = 2.84;
const defaultHeight = 2.967;

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
      const w = bay.width ?? donorWidth, h = bay.height ?? defaultHeight;
      const first = i * 3;
      for (const [j, side] of [-1, 1].entries()) {
        place(frame, first + j, side * (w / 2 + .06), h / 2, -.01, .12, h, .20);
        frame.setColorAt(first + j, tint.set("#8f8580"));
      }
      // The sheet coils inside this housing above the opening. Leave the sill clear.
      const hood = .58 * h / donorHeight;
      place(frame, first + 2, 0, h + hood / 2, .20, w + .24, hood, .61);
      frame.setColorAt(first + 2, tint.set("#554f48"));
      place(lamp, i, 0, h + .12, .52, .054, w * .56, .054, Math.PI / 2);
    });
    frame.instanceMatrix.needsUpdate = true;
    if (frame.instanceColor) frame.instanceColor.needsUpdate = true;
    lamp.instanceMatrix.needsUpdate = true;
    frame.computeBoundingSphere();
    lamp.computeBoundingSphere();
    invalidate();
  }, [bays, invalidate]);
  return <>
    <instancedMesh ref={frames} name="garage-bay-frames" args={[undefined, undefined, bays.length * 3]}>
      <boxGeometry />
      <meshStandardMaterial metalness={.30} roughness={.55} emissive="#171511" />
    </instancedMesh>
    <instancedMesh ref={lamps} name="garage-bay-lamps" args={[undefined, undefined, bays.length]}>
      <cylinderGeometry args={[.5, .5, 1, 8]} />
      <meshBasicMaterial color="#ffe3b5" />
    </instancedMesh>
  </>;
}

type MovingDoors = Props & { openings: Float32Array };

/** Lift the sheet without stretching its ribs or paint. Above the lintel it winds
 * onto an inward spiral inside the metal hood. Only the small lift uniform changes. */
function rollUpMaterial(finish: MeshStandardMaterial, openings: Float32Array) {
  finish.customProgramCacheKey = () => `garage-shutter-${openings.length}`;
  finish.onBeforeCompile = shader => {
    shader.uniforms.garageBayLift = { value: openings };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float garageBayLift[${openings.length}];
      `)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
        const float garageLintel = ${donorHeight};
        const float rollerY = garageLintel + .28;
        float raisedY = position.y + garageBayLift[gl_InstanceID] * garageLintel;
        vec2 coil = vec2(0.);
        if (raisedY > rollerY) {
          float angle = (raisedY - rollerY) / .19;
          vec2 roller = vec2(cos(angle), sin(angle));
          float radius = .224 - angle * .007 - position.z;
          coil = vec2(rollerY + radius * roller.y, .224 - radius * roller.x);
          mat2 bend = mat2(roller.x, roller.y, -roller.y, roller.x);
          objectNormal.yz = bend * objectNormal.yz;
          #ifdef USE_TANGENT
            objectTangent.yz = bend * objectTangent.yz;
          #endif
        }
      `)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        transformed.y = raisedY;
        if (raisedY > rollerY) transformed.yz = coil;
      `);
  };
  return finish;
}

function ShutterSheets({ bays, geometry, finish, name, sourceMatrix }: Props & {
  geometry: BufferGeometry; finish: MeshStandardMaterial; name: string; sourceMatrix?: Matrix4;
}) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const sheets = ref.current;
    if (!sheets) return;
    const door = new Object3D(), matrix = new Matrix4();
    bays.forEach((bay, i) => {
      door.scale.set((bay.width ?? donorWidth) / donorWidth, (bay.height ?? defaultHeight) / donorHeight, 1);
      positionDoor(door, bay);
      matrix.copy(door.matrix);
      if (sourceMatrix) matrix.multiply(sourceMatrix);
      sheets.setMatrixAt(i, matrix);
    });
    sheets.instanceMatrix.needsUpdate = true;
    sheets.computeBoundingSphere();
    // Shader-deformed coils fit inside the static header.
    if (sheets.boundingSphere) sheets.boundingSphere.radius += .8;
    invalidate();
    return () => { sheets.dispose(); };
  }, [bays, geometry, finish, sourceMatrix, invalidate]);
  return <instancedMesh ref={ref} name={name} args={[geometry, finish, bays.length]} dispose={null} />;
}

// The network-free sheets travel on the same rollers as the textured doors.
function GarageBaySlats({ bays, openings }: MovingDoors) {
  const panel = useMemo(() => {
    const rows = 18 * 4;
    const geometry = new PlaneGeometry(donorWidth, donorHeight, 1, rows).translate(0, donorHeight / 2, 0);
    const position = geometry.attributes.position;
    const profile = [-.008, -.012, -.039, -.04];
    for (let i = 0; i < position.count; i++) {
      const course = Math.round(position.getY(i) * rows / donorHeight);
      position.setZ(i, profile[course % profile.length]);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  const finish = useMemo(() => rollUpMaterial(new MeshStandardMaterial({
    color: "#727674", emissive: "#33312d", metalness: .42, roughness: .68, side: DoubleSide,
  }), openings), [openings]);
  useLayoutEffect(() => () => panel.dispose(), [panel]);
  useLayoutEffect(() => () => finish.dispose(), [finish]);
  return <ShutterSheets bays={bays} geometry={panel} finish={finish} name="garage-bay-slats" />;
}

function GarageBayShutters({ bays, openings }: MovingDoors) {
  const { scene } = useLoader(GLTFLoader, shutterUrl);
  const source = scene.getObjectByProperty("isMesh", true);
  const finish = useMemo(() => {
    if (!(source instanceof Mesh) || !(source.material instanceof MeshStandardMaterial)) return;
    source.updateWorldMatrix(true, false);
    const material = source.material.clone();
    material.emissiveMap = material.map;
    material.emissive.setRGB(.46, .39, .31);
    return rollUpMaterial(material, openings);
  }, [source, openings]);
  useLayoutEffect(() => () => finish?.dispose(), [finish]);
  if (!(source instanceof Mesh) || !finish) return <GarageBaySlats bays={bays} openings={openings} />;
  return <ShutterSheets bays={bays} geometry={source.geometry} sourceMatrix={source.matrixWorld}
    finish={finish} name="garage-bay-shutters" />;
}

export function GarageBayDoors({ bays, detailed = true }: Props & { detailed?: boolean }) {
  const invalidate = useThree(state => state.invalidate);
  const openings = useMemo(() => new Float32Array(bays.length), [bays.length]);
  const moving = useRef(false);
  useLayoutEffect(() => {
    const wake = () => { moving.current = true; invalidate(); };
    moving.current = garageBayMotion.sample(openings, performance.now());
    invalidate();
    return garageBayMotion.subscribe(wake);
  }, [invalidate, openings]);
  useFrame(() => {
    if (!moving.current) return;
    moving.current = garageBayMotion.sample(openings, performance.now());
    if (moving.current) invalidate();
  });
  if (!bays.length) return null;
  const slats = <GarageBaySlats bays={bays} openings={openings} />;
  return <group name="garage-bay-doors">
    <GarageBayFrames bays={bays} />
    {detailed ? <AssetBoundary resetKey={shutterUrl} fallback={slats}>
      <Suspense fallback={slats}><GarageBayShutters bays={bays} openings={openings} /></Suspense>
    </AssetBoundary> : slats}
  </group>;
}
