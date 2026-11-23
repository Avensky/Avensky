import { Mesh, MeshStandardMaterial, type Object3D } from "three";

export const BRZ_GARAGE_ENABLED = import.meta.env.DEV || import.meta.env.MODE === "staging";

export const BRZ_CABIN_PARTS = [
  { id: "seat-fabric", label: "Seat upholstery", meshes: ["Mesh132_red1_0", "Mesh134_red1_0"] },
  { id: "seat-shell", label: "Seat shells", meshes: ["Mesh132_black1_0", "Mesh134_black1_0"] },
  { id: "seat-belt", label: "Harness straps", meshes: ["Mesh129__Color_A08_6_0", "Mesh133__Color_A08_6_0"] },
  { id: "seat-buckle", label: "Harness buckles", meshes: ["Mesh129__Color_B05_3_0", "Mesh133__Color_B05_3_0"] },
  { id: "harness-mount", label: "Harness mounts", meshes: ["Mesh129_black1_0", "Mesh133_black1_0"] },
  { id: "seat-rail", label: "Floor rails", meshes: ["Mesh131_black1_0", "Mesh136_black1_0"] },
  { id: "seat-brace", label: "Seat braces", meshes: ["Mesh130__Color_C03_1_0", "Mesh135__Color_C03_1_0"] },
  { id: "steering-wheel", label: "Steering wheel rim", meshes: ["Mesh128_black1_0"] },
  { id: "steering-trim", label: "Steering wheel trim", meshes: ["Mesh128__Color_B05_3_0"] },
  { id: "parking-brake", label: "Parking brake", meshes: ["brz-parking-brake"] },
  { id: "shift-knob", label: "Shift knob", meshes: ["brz-shift-knob"] },
] as const;

type CabinPart = typeof BRZ_CABIN_PARTS[number]["id"];
export type BrzCabinColors = Partial<Record<CabinPart, string>>;
const COLOR = /^#[a-f\d]{6}$/i;

export function validBrzCabinColors(value: unknown): BrzCabinColors {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(BRZ_CABIN_PARTS.flatMap(({ id }) => {
    const color = (value as BrzCabinColors)[id];
    return typeof color === "string" && COLOR.test(color) ? [[id, color]] : [];
  }));
}

export function prepareBrzCabin(root: Object3D) {
  const materials = BRZ_CABIN_PARTS.flatMap(({ id, meshes, label }) => meshes.flatMap((name, index) => {
    const mesh = root.getObjectByName(name);
    if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshStandardMaterial)) return [];
    const material = mesh.material.clone();
    mesh.material = material;
    mesh.userData.brzPart = { id, label, side: meshes.length === 2 ? index === 0 ? "left" : "right" : null, sourceName: name };
    return { id, mesh, material, factory: material.color.clone() };
  }));
  return {
    objects: materials.map(({ mesh }) => mesh),
    apply(colors: BrzCabinColors, seats: "factory" | "red" | "black") {
      for (const { id, material, factory } of materials) {
        const color = colors[id] ?? (id === "seat-fabric" && seats !== "factory" ? seats === "red" ? "#a11326" : "#17181c" : undefined);
        if (color) material.color.set(color);
        else material.color.copy(factory);
      }
    },
    dispose() { materials.forEach(({ material }) => material.dispose()); },
  };
}
