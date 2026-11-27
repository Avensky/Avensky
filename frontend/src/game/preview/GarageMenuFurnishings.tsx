import { Suspense, useCallback, useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
  BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PlaneGeometry, type BufferGeometry, type Material,
} from "three";
import { GARAGE_MENU_LANDMARKS } from "./garageMenuLandmarks";
import { garagePaintedFinish } from "./garagePaintedFinish";
import { garageRoutePlan } from "./garageRoutePlan";
import { assetAvailable, stagingAssetsEnabled } from "../../assets/runtimeAssets";
import { useAssetGLTF } from "../../assets/useAssetGLTF";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";

type Triple = [number, number, number];
type Finish = "steel" | "round" | "glass" | "light" | "shade" | "paper";
type Part = { matrix: Matrix4; color: string };

const iron = "#554f48", dark = "#343839", edge = "#8f8580", brass = "#ac8966";
const timber = "#aa815f", canvas = "#aaa58e";
const level: Triple = [0, 0, 0];

/** All bolts, drawer faces and cabinet vents share static batches across the room. */
function buildFurnishings() {
  const group = new Group();
  group.name = "garage-menu-furnishings";
  const parts: Record<Finish, Part[]> = { steel: [], round: [], glass: [], light: [], shade: [], paper: [] };
  const station = new Object3D(), local = new Object3D();
  function place(anchor: readonly number[], yaw: number) {
    station.position.set(anchor[0], 0, anchor[2]);
    station.rotation.y = yaw;
    station.updateMatrix();
  }
  function part(finish: Finish, color: string, position: Triple, size: Triple, rotation: Triple = level) {
    local.position.set(...position);
    local.rotation.set(...rotation);
    local.scale.set(...size);
    local.updateMatrix();
    parts[finish].push({ matrix: new Matrix4().multiplyMatrices(station.matrix, local.matrix), color });
  }
  const box = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) =>
    part("steel", color, [x, y, z], [w, h, d]);

  // Vented steel lockers, hardware, a standing mirror and slatted changing bench.
  place(GARAGE_MENU_LANDMARKS.wardrobe, .28);
  const lockerStart = parts.steel.length;
  box(dark, .32, 1.02, -.16, 1.48, 1.93, .48);
  for (let column = 0; column < 3; column++) {
    const x = -.15 + column * .47;
    box(["#69706b", "#626963", "#626862"][column], x, 1.04, .1, .44, 1.84, .05);
    for (const y of [.27, 1.72]) {
      for (let i = 0; i < 4; i++) box(dark, x, y + .031 * i, .132, .25, .013, .012);
    }
    box(edge, x, 1.55, .133, .108, .048, .009);
    box(canvas, x, 1.55, .139, .084, .027, .004);
    box(iron, x + .13, 1.00, .14, .048, .19, .035);
    box(brass, x + .13, 1.03, .169, .025, .093, .033);
  }
  const lockerPanels = parts.steel.splice(lockerStart);
  for (const x of [-1.1, -.52]) box(iron, x, .048, .28, .07, .08, .54);
  box(brass, -.81, .98, .12, .78, 1.83, .09);
  box(dark, -.81, .98, .17, .72, 1.77, .018);
  part("glass", "#c0c8bf", [-.81, .98, .186], [.671, 1.716, .012]);
  for (const x of [.14, .97]) box(iron, x, .225, .46, .076, .43, .32);
  for (const z of [.31, .44, .57]) box(timber, .56, .47, z, 1.19, .064, .108);

  // A low rolling stand supports the portable donor chest, which has no wheels.
  place(GARAGE_MENU_LANDMARKS.vehicle, .60);
  for (const x of [-.34, .34]) {
    for (const z of [-.20, .08]) {
      part("round", dark, [x, .087, z], [.14, .06, .14], [0, 0, Math.PI / 2]);
      box(iron, x, .155, z, .07, .13, .07);
    }
  }
  box(iron, 0, .22, -.06, .88, .07, .52);

  // Drafting desk, weighted paper, plan rack, swing-arm lamp and workshop stool.
  place(GARAGE_MENU_LANDMARKS.world_editor, .57);
  for (const x of [-.83, .83]) {
    for (const z of [-.47, .47]) box(iron, x, .424, z, .079, .85, .079);
    box(dark, x, .23, 0, .08, .06, .98);
  }
  box(dark, 0, .27, .32, 1.77, .069, .07);
  for (let i = 0; i < 5; i++) {
    const z = (i - 2) * .226;
    const color = ["#907259", "#9f7960", "#a88366", "#9a765c", "#947258"][i];
    part("steel", color, [0, .847 - .12 * z, z], [1.89, .085, .226], [.12, 0, 0]);
  }
  part("paper", "#ffffff", [-.12, .90, .016], [1.32, .82, 1], [-Math.PI / 2 + .12, 0, 0]);
  for (const x of [-.72, .45]) {
    for (const z of [-.32, .34]) box(brass, x, .916 - .12 * z, z, .08, .023, .048);
  }
  for (let i = 0; i < 3; i++) {
    const x = -.68 + i * .122;
    part("round", i === 1 ? "#ab9e85" : canvas, [x, .45, .39], [.092, .77, .092], [Math.PI / 2, 0, 0]);
    part("round", "#49443b", [x, .45, .777], [.059, .007, .059], [Math.PI / 2, 0, 0]);
  }
  part("round", iron, [.82, 1.00, .04], [.11, .20, .11]);
  for (let i = 0; i < 4; i++) {
    part("round", i % 2 ? brass : "#c89458", [.80 + i * .013, 1.12 + i * .011, .04], [.012, .18, .012], [0, 0, (i - 1.5) * .12]);
  }
  part("steel", "#c1af8e", [.63, .896, .11], [.041, .015, .67], [.12, .05, 0]);
  part("round", iron, [.68, .94, -.30], [.28, .064, .28]);
  part("steel", brass, [.75, 1.18, -.30], [.042, .50, .047], [0, 0, -.27]);
  part("steel", iron, [.59, 1.46, -.30], [.46, .048, .052], [0, 0, .22]);
  part("shade", "#9e8466", [.34, 1.41, -.30], [.34, .17, .34], [-.50, 0, -.28]);
  part("light", "#ffe1ad", [.315, 1.334, -.259], [.335, .018, .335], [-.50, 0, -.28]);
  for (const x of [-.25, .01]) {
    for (const z of [-.98, -.76]) box(iron, x, .32, z, .039, .64, .039);
  }
  part("round", timber, [-.12, .66, -.86], [.44, .063, .44]);
  // An open planning alcove: steel-framed half partitions leave the authored
  // sign and practical lights visible through the upper panels.
  const alcoveX = 1.46, rear = -2.52, side = alcoveX + .9;
  box("#484e4c", alcoveX, .45, rear, 1.8, .85, .043);
  box("#484e4c", side, .45, rear + .64, .043, .85, 1.28);
  box("#575c57", alcoveX, .43, rear, 1.8, .84, .078);
  box("#575c57", side, .43, rear + .64, .078, .84, 1.28);
  for (const x of [alcoveX - .90, side]) box(iron, x, 1.18, rear, .064, 2.36, .064);
  box(iron, side, 1.18, rear + 1.28, .064, 2.36, .064);
  for (const y of [.87, 2.34]) {
    box(edge, alcoveX, y, rear, 1.86, .045, .064);
    box(edge, side, y, rear + .64, .064, .045, 1.28);
  }
  box(iron, alcoveX, 1.49, rear, 1.56, 1.09, .093);
  part("paper", "#e8e2d2", [alcoveX, 1.49, rear + .057], [1.39, .87, 1]);

  const map = garageRoutePlan();
  const painted = new MeshStandardMaterial({ metalness: .3, roughness: .53, emissive: "#100e0b" });
  painted.onBeforeCompile = garagePaintedFinish;
  const surface = new MeshStandardMaterial({ metalness: .92, roughness: .17, envMapIntensity: 1.25, emissive: "#171b1b" });
  // Keep the real fixture probe on the glass. Two soft strips supply a stable
  // reflected rack silhouette even on devices which disable that probe.
  surface.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec2 panelUV;\n" + shader.vertexShader.replace(
      "#include <uv_vertex>", "#include <uv_vertex>\n panelUV = uv;");
    shader.fragmentShader = "varying vec2 panelUV;\n" + shader.fragmentShader.replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      vec2 p = panelUV;
      float horizon = .31 + .09*p.x;
      float ground = 1.-smoothstep(horizon-.025,horizon+.025,p.y);
      vec3 glassBase = mix(vec3(.033,.043,.044),vec3(.105,.080,.061),ground);
      float slant = p.y-.24*p.x;
      float rack = (1.-smoothstep(.009,.023,abs(slant-.47)))
                 + (1.-smoothstep(.009,.019,abs(slant-.66)));
      float stripEnds = smoothstep(.05,.1,p.x)*(1.-smoothstep(.62,.72,p.x));
      float haze = (1.-smoothstep(.02,.19,abs(slant-.58)))*.03;
      totalEmissiveRadiance += glassBase + vec3(.48,.32,.15)*rack*stripEnds + haze;
    `);
  };
  const printed = new MeshBasicMaterial({ map, color: "#d4c7ac" });
  const luminous = new MeshBasicMaterial();
  const cube = new BoxGeometry();
  const tube = new CylinderGeometry(.5, .5, 1, 16);
  const shade = new CylinderGeometry(.18, .5, 1, 16, 1, true);
  const paper = new PlaneGeometry();
  const meshes: InstancedMesh[] = [];
  function batch(kind: Finish, geometry: BufferGeometry, material: Material) {
    const instances = parts[kind];
    const mesh = new InstancedMesh(geometry, material, instances.length);
    const tint = new Color();
    instances.forEach(({ matrix, color }, i) => {
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, tint.set(color));
    });
    mesh.name = "garage-furnishing-" + kind;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
    return mesh;
  }
  // Keep the fallback locker at the tail of the existing draw so it can be hidden independently.
  const fixedSteelCount = parts.steel.length;
  parts.steel.push(...lockerPanels);
  const steel = batch("steel", cube, painted);
  batch("round", tube, painted);
  batch("shade", shade, painted);
  batch("glass", cube, surface);
  batch("light", tube, luminous);
  batch("paper", paper, printed);
  return {
    group,
    showLockerFallback(visible: boolean) {
      steel.count = fixedSteelCount + (visible ? lockerPanels.length : 0);
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const geometry of [cube, tube, shade, paper]) geometry.dispose();
      for (const material of [painted, surface, printed, luminous]) material.dispose();
      map.dispose();
    },
  };
}

type WorkshopProp = "metal-tool-chest" | "service-tire" | "metal-shelf";

type EvaluationProp = "engine-crane" | "car-jack" | "cabinet";
type PropPlacement = { position?: Triple; yaw?: number; scale?: number; onReady?: (mounted: boolean) => void };

function WorkshopModel({ url, onReady }: { url: string; onReady?: PropPlacement["onReady"] }) {
  const { scene } = useAssetGLTF(url);
  const host = useRef<Group>(null);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    // These metals need the same workshop bounce as the painted fixtures. Tint their
    // original base map so scratches and tread remain visible in the unlit recesses.
    const object = scene.clone();
    const materials: MeshStandardMaterial[] = [];
    object.traverse(child => {
      if (!(child instanceof Mesh) || !(child.material instanceof MeshStandardMaterial)) return;
      const finish = child.material.clone();
      finish.emissiveMap = finish.map;
      finish.emissive.setRGB(.46, .39, .31);
      child.material = finish;
      materials.push(finish);
    });
    host.current?.add(object);
    onReady?.(true);
    invalidate();
    return () => {
      object.removeFromParent();
      onReady?.(false);
      for (const material of materials) material.dispose();
    };
  }, [scene, invalidate, onReady]);
  return <group ref={host} />;
}

function WorkshopPropModel({ name, url, position, yaw = 0, scale = 1, onReady }:
  PropPlacement & { name: WorkshopProp | EvaluationProp; url: string }) {
  return <group name={name} position={position} rotation-y={yaw} scale={scale}>
    <AssetBoundary resetKey={url} fallback={null}>
      <Suspense fallback={null}><WorkshopModel url={url} onReady={onReady} /></Suspense>
    </AssetBoundary>
  </group>;
}

function OpenWorkshopProp({ name, ...placement }: PropPlacement & { name: WorkshopProp }) {
  return <WorkshopPropModel name={name} url={`/open-art/garage/${name}/${name}.gltf`} {...placement} />;
}

function EvaluationWorkshopProp({ name, ...placement }: PropPlacement & { name: EvaluationProp }) {
  const url = `/models/world/garage-evaluation/${name}.glb`;
  if (!stagingAssetsEnabled || !assetAvailable(url)) return null;
  return <WorkshopPropModel name={name} url={url} {...placement} />;
}

export function GarageMenuFurnishings() {
  const scene = useThree(state => state.scene);
  const invalidate = useThree(state => state.invalidate);
  const current = useRef<ReturnType<typeof buildFurnishings> | null>(null);
  const cabinetMounted = useRef(false);
  const handleCabinetReady = useCallback((mounted: boolean) => {
    cabinetMounted.current = mounted;
    current.current?.showLockerFallback(!mounted);
    invalidate();
  }, [invalidate]);
  useLayoutEffect(() => {
    const furnishings = buildFurnishings();
    current.current = furnishings;
    furnishings.showLockerFallback(!cabinetMounted.current);
    scene.add(furnishings.group);
    invalidate();
    return () => {
      current.current = null;
      scene.remove(furnishings.group);
      furnishings.dispose();
      invalidate();
    };
  }, [scene, invalidate]);
  const [lockerX, , lockerZ] = GARAGE_MENU_LANDMARKS.wardrobe;
  const [bayX, , bayZ] = GARAGE_MENU_LANDMARKS.vehicle;
  return <>
    <group position={[bayX, 0, bayZ]} rotation-y={.60}>
      <OpenWorkshopProp name="metal-tool-chest" position={[0, .255, -.06]} scale={1.12} />
      <EvaluationWorkshopProp name="car-jack" position={[.80, 0, -.03]} yaw={.60} />
      <OpenWorkshopProp name="service-tire" position={[-.70, 0, -.075]} yaw={.55} />
    </group>
    <EvaluationWorkshopProp name="engine-crane" position={[-3.65, 0, -1.75]} yaw={-.50} />
    <group position={[lockerX, 0, lockerZ]} rotation-y={.28}>
      <EvaluationWorkshopProp name="cabinet" position={[.32, 0, -.16]} onReady={handleCabinetReady} />
    </group>
    <OpenWorkshopProp name="metal-shelf" position={[-3.66, 0, -3.75]} yaw={.40} />
  </>;
}
