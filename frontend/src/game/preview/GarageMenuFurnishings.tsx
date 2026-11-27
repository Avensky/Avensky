import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import {
  BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PlaneGeometry, TorusGeometry, type BufferGeometry, type Material,
} from "three";
import { GARAGE_MENU_LANDMARKS } from "./garageMenuLandmarks";
import { garageRoutePlan } from "./garageRoutePlan";

type Triple = [number, number, number];
type Finish = "steel" | "round" | "rubber" | "glass" | "light" | "shade" | "paper";
type Part = { matrix: Matrix4; color: string };

const iron = "#554f48", dark = "#343839", edge = "#8f8580", brass = "#ac8966";
const timber = "#aa815f", canvas = "#aaa58e";
const level: Triple = [0, 0, 0];

/** All bolts, drawer faces and cabinet vents share static batches across the room. */
function buildFurnishings() {
  const group = new Group();
  group.name = "garage-menu-furnishings";
  const parts: Record<Finish, Part[]> = { steel: [], round: [], rubber: [], glass: [], light: [], shade: [], paper: [] };
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

  // Corrugated harbor shutter behind the original tube rack, with a wicket door.
  place(GARAGE_MENU_LANDMARKS.enter_world, .40);
  box(dark, 0, 1.47, -.14, 2.68, 2.9, .14);
  for (let i = 0; i < 20; i++) box(i % 2 ? "#88837a" : "#9b9486", 0, .20 + i * .137, -.04, 2.53, .116, .055);
  for (const x of [-1.35, 1.35]) box(edge, x, 1.48, -.02, .12, 2.96, .2);
  box(iron, 0, 2.96, -.04, 2.86, .21, .21);
  box("#666d66", .53, 1.03, .03, .88, 2.05, .08);
  box(edge, .53, 1.55, .09, .69, .65, .025);
  part("glass", "#b9cabf", [.53, 1.55, .11], [.58, .55, .018]);
  box(brass, .52, .95, .12, .62, .047, .052);
  part("light", "#ffe3b5", [0, 2.84, .09], [.06, 1.47, .06], [0, 0, Math.PI / 2]);

  // Vented steel lockers, hardware, a standing mirror and slatted changing bench.
  place(GARAGE_MENU_LANDMARKS.wardrobe, .28);
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
  for (const x of [-1.1, -.52]) box(iron, x, .048, .28, .07, .08, .54);
  box(brass, -.81, .98, .12, .78, 1.83, .09);
  box(dark, -.81, .98, .17, .72, 1.77, .018);
  part("glass", "#c0c8bf", [-.81, .98, .186], [.671, 1.716, .012]);
  for (const x of [.14, .97]) box(iron, x, .225, .46, .076, .43, .32);
  for (const z of [.31, .44, .57]) box(timber, .56, .47, z, 1.19, .064, .108);

  // Low cart with wheels, drawers, a ratchet and a pair of upright service tyres.
  place(GARAGE_MENU_LANDMARKS.vehicle, .6);
  box(dark, 0, .48, -.07, .91, .66, .49);
  for (const x of [-.35, .35]) {
    for (const z of [-.22, .09]) part("round", dark, [x, .105, z], [.142, .059, .142], [0, 0, Math.PI / 2]);
  }
  for (let i = 0; i < 4; i++) {
    const y = .29 + i * .134;
    box("#965039", 0, y, .19, .84, .117, .036);
    box(edge, 0, y + .036, .214, .71, .018, .025);
  }
  box(iron, 0, .835, -.065, .99, .06, .56);
  box(brass, -.17, .878, -.062, .31, .028, .038);
  for (const x of [-.67, -.84]) {
    part("rubber", "#56534d", [x, .328, -.09], [.50, .50, .50], [0, 1.04, .12]);
  }

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
  // The source room has direct bulbs and a fixture-only environment probe.
  // Bake a little wall bounce into the enamel so its recesses stay legible.
  painted.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vec3(.31, .28, .24);
    `);
  };
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
  const tire = new MeshStandardMaterial({ roughness: .91, emissive: "#090807" });
  const printed = new MeshBasicMaterial({ map, color: "#d4c7ac" });
  const luminous = new MeshBasicMaterial();
  const cube = new BoxGeometry();
  const tube = new CylinderGeometry(.5, .5, 1, 16);
  const wheel = new TorusGeometry(.49, .147, 8, 24);
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
  }
  batch("steel", cube, painted);
  batch("round", tube, painted);
  batch("rubber", wheel, tire);
  batch("shade", shade, painted);
  batch("glass", cube, surface);
  batch("light", tube, luminous);
  batch("paper", paper, printed);
  return {
    group,
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const geometry of [cube, tube, wheel, shade, paper]) geometry.dispose();
      for (const material of [painted, surface, tire, printed, luminous]) material.dispose();
      map.dispose();
    },
  };
}

export function GarageMenuFurnishings() {
  const scene = useThree(state => state.scene);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const furnishings = buildFurnishings();
    scene.add(furnishings.group);
    invalidate();
    return () => {
      scene.remove(furnishings.group);
      furnishings.dispose();
      invalidate();
    };
  }, [scene, invalidate]);
  return null;
}
