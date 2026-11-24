import { Color, MeshStandardMaterial, type Material } from "three";
import { shortSkirtWeave } from "./shortSkirtFabric";

const brass = new Color("#b39160");

export function restoreDressMaterial(material: Material, channel: string, hasUVs: boolean) {
  if (!(material instanceof MeshStandardMaterial)) return;
  const leather = /(?:belt|bag)/i.test(material.name);
  const metal = channel === "hardware";
  const edging = channel === "trim" && !leather;

  // Preserve the licensed atlas and its UVs. The exports carry surface relief
  // but often have flat base colors across the bands, buckles and fabric.
  if (material.normalMap) material.normalScale.multiplyScalar(metal ? .7 : edging || leather ? 1.22 : 1.08);
  if (metal) {
    material.color.lerp(brass, .64);
    material.metalness = .65;
    material.roughness = .41;
  } else if (leather) {
    material.color.multiplyScalar(.56);
    material.metalness = 0;
    material.roughness = .59;
  } else {
    if (hasUVs && !material.map) material.map = shortSkirtWeave();
    material.metalness = 0;
    material.roughness = edging ? .76 : .88;
  }
}
