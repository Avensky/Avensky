import { DoubleSide, Float32BufferAttribute, MathUtils, Ray, Uint16BufferAttribute, Vector3,
  type BufferGeometry, type SkinnedMesh } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { wardrobeCoverageSurface } from "./wardrobeCoverage";
import { fitWardrobeSurface } from "./wardrobeSurface";

export const LACED_LINEN_SHIRT = "CLOTH_MEDIEVAL_01_0_0";
export const LACED_LINEN_OVERDRESS = "CLOTH_MEDIEVAL_01_1_1";
export const LACED_LINEN_UNDERSKIRT = "CLOTH_MEDIEVAL_01_2_0";

function splitUnderskirtForBends(geometry: BufferGeometry) {
  // The compact model has triangles spanning both the hip and the knee.
  // Add vertices across that transition before applying the shared weights.
  const heights = [-Infinity, .55, .68, .78, .86, .94, Infinity];
  const segments = heights.slice(1).flatMap((top, i) => {
    const segment = fitWardrobeSurface(geometry, [p => p.y - heights[i], p => top - p.y], 0, true);
    return segment ? [segment] : [];
  });
  const fitted = segments.length ? mergeGeometries(segments) : undefined;
  for (const segment of segments) segment.dispose();
  return fitted;
}

/** Give the nested skirt panels the same motion and leave room between the layers. */
export function fitLacedLinenLayers(meshes: readonly SkinnedMesh[]) {
  const outer = meshes.find(mesh => mesh.name === LACED_LINEN_OVERDRESS);
  if (!outer) return [];
  const bones = ["pelvis", "thigh_l", "thigh_r"].map(name => outer.skeleton.bones.findIndex(bone => bone.name === name));
  if (bones.some(joint => joint < 0)) return [];
  const surface = wardrobeCoverageSurface(outer.geometry);
  if (!surface) return [];
  const [pelvis, leftThigh, rightThigh] = bones;
  const ray = new Ray(), point = new Vector3(), radial = new Vector3();
  const fitted: BufferGeometry[] = [];
  const centerZ = .022;
  for (const mesh of meshes) {
    const shirt = mesh.name === LACED_LINEN_SHIRT;
    const underskirt = mesh.name === LACED_LINEN_UNDERSKIRT;
    if (!shirt && mesh !== outer && !underskirt) continue;
    const split = underskirt ? splitUnderskirtForBends(mesh.geometry) : undefined;
    const geometry = split ?? mesh.geometry.clone();
    const position = geometry.getAttribute("position");
    const oldJoints = geometry.getAttribute("skinIndex"), oldWeights = geometry.getAttribute("skinWeight");
    const joints = new Uint16BufferAttribute(position.count * 4, 4), weights = new Float32BufferAttribute(position.count * 4, 4);
    let adjusted = false;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      const { x, y, z } = point;
      radial.set(x, 0, z - centerZ);
      const radius = radial.length();
      radial.normalize();
      const blend = shirt ? (y < .32 ? 1 : 0) : 1 - MathUtils.smoothstep(y, .97, 1.15);
      if (mesh !== outer && radius > 0 && y < 1.21 && (!shirt || y < .32 || Math.abs(x) < .15)) {
        ray.origin.set(0, y, centerZ);
        ray.direction.copy(radial);
        const cover = surface.raycastFirst(ray, DoubleSide);
        // No hit at the front opening means the original visible panel stays put.
        if (cover && cover.distance < radius + .024) {
          const inset = Math.max(.025, cover.distance - (underskirt ? .035 : y < 1.05 ? .027 : .014));
          if (radius > inset) {
            position.setXYZ(i, radial.x * inset, y, centerZ + radial.z * inset);
            adjusted = true;
          }
        }
      }
      if (underskirt && z > .085) {
        // The top edge of the panel turns under the front waist opening.
        const tuck = MathUtils.smoothstep(y, .95, 1.03) * (1 - MathUtils.smoothstep(Math.abs(x), .026, .058));
        // Leave overlap at the sides of the front panel through seated
        // bends, and at the join where its lower edge meets the hem.
        const knee = MathUtils.smoothstep(y, .58, .655) * (1 - MathUtils.smoothstep(y, .79, .875));
        const edge = MathUtils.smoothstep(Math.abs(x), .038, .064);
        const hem = 1 - MathUtils.smoothstep(y, .26, .32);
        const clearance = .012 * knee * edge + .016 * hem;
        if (tuck > 0 || clearance > 0) {
          const depth = position.getZ(i);
          position.setZ(i, MathUtils.lerp(depth, Math.min(.086, depth), tuck) - clearance);
          adjusted = true;
        }
      }
      if (blend <= 0) {
        for (let c = 0; c < 4; c++) {
          joints.setComponent(i, c, oldJoints.getComponent(i, c));
          weights.setComponent(i, c, oldWeights.getComponent(i, c));
        }
        continue;
      }
      const lower = .62 * (1 - MathUtils.smoothstep(y, .71, .99));
      const left = MathUtils.smoothstep(radial.x, -.45, .45);
      const influences = new Map<number, number>([
        [pelvis, (1 - lower) * blend], [leftThigh, lower * left * blend], [rightThigh, lower * (1 - left) * blend],
      ]);
      for (let c = 0; c < 4; c++) {
        const weight = oldWeights.getComponent(i, c) * (1 - blend);
        if (!weight) continue;
        const joint = oldJoints.getComponent(i, c);
        influences.set(joint, (influences.get(joint) ?? 0) + weight);
      }
      const strongest = [...influences].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
      const sum = strongest.reduce((total, [, weight]) => total + weight, 0);
      for (let c = 0; c < 4; c++) {
        const [joint, weight] = strongest[c] ?? [0, 0];
        joints.setComponent(i, c, joint);
        weights.setComponent(i, c, weight / sum);
      }
    }
    geometry.setAttribute("skinIndex", joints).setAttribute("skinWeight", weights);
    if (adjusted) {
      geometry.computeVertexNormals();
      if (geometry.hasAttribute("uv") && (split || geometry.hasAttribute("tangent"))) geometry.computeTangents();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    }
    mesh.geometry = geometry;
    fitted.push(geometry);
  }
  surface.geometry.dispose();
  return fitted;
}
