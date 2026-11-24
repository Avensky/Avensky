import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, MathUtils, MeshStandardMaterial,
  Ray, SkinnedMesh, Triangle, Uint16BufferAttribute, Vector3, type Skeleton,
} from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { PieceColors } from "./clothingPieces";
import type { CharacterLook } from "./characterCatalog";
import { HOODED_GOWN } from "./wardrobeDressFit";

export const HOODED_GOWN_DYES = [
  { key: "color", piece: "dress", field: "color", label: "Gown fabric", original: "#392d46", theme: "color" },
  { key: "panel", piece: "skirt", field: "color", label: "Inset panels", original: "#79536e", theme: "accent" },
  { key: "accent", piece: "hat", field: "color", label: "Hood and cuffs", original: "#665676", theme: "accent" },
  { key: "laces", piece: "dress", field: "accent", label: "Bodice laces", original: "#e1c6a5" },
] as const;

export function hoodedGownColors(look: CharacterLook) {
  const colors = look.appearance.item_colors;
  return Object.fromEntries(HOODED_GOWN_DYES.map(({ key, piece, field }) => [
    key, colors?.[`${HOODED_GOWN}:${piece}`]?.[field],
  ])) as Pick<PieceColors, typeof HOODED_GOWN_DYES[number]["key"]>;
}

type JointWeights = Map<number, number>;

function addSkin(weights: JointWeights, geometry: BufferGeometry, vertex: number, factor: number) {
  const indices = geometry.getAttribute("skinIndex"), influence = geometry.getAttribute("skinWeight");
  for (let channel = 0; channel < 4; channel++) {
    const joint = indices.getComponent(vertex, channel), weight = factor * influence.getComponent(vertex, channel);
    if (weight > 0) weights.set(joint, (weights.get(joint) ?? 0) + weight);
  }
}

function writeSkin(weights: JointWeights, indices: Uint16Array, influence: Float32Array, vertex: number) {
  const strongest = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = strongest.reduce((sum, entry) => sum + entry[1], 0);
  for (const [channel, [joint, weight]] of strongest.entries()) {
    indices[vertex * 4 + channel] = joint;
    influence[vertex * 4 + channel] = weight / total;
  }
}

function gownCloth(source: BufferGeometry, skeleton: Skeleton) {
  const prepared = source.clone(), position = source.getAttribute("position");
  const indices = source.getAttribute("skinIndex"), weights = source.getAttribute("skinWeight");
  const armJoints = skeleton.bones.map(({ name }) => /^(?:upperarm|lowerarm|hand)(?:_twist_\d+)?_[lr]$/.test(name));
  const regions = new Float32Array(position.count * 2);
  const point = new Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    point.fromBufferAttribute(position, vertex);
    let followsArm = 0;
    for (let channel = 0; channel < 4; channel++) {
      if (armJoints[indices.getComponent(vertex, channel)]) followsArm += weights.getComponent(vertex, channel);
    }
    const cuff = MathUtils.smoothstep(Math.abs(point.x), .225, .333) * MathUtils.smoothstep(followsArm, .48, .88);
    const front = MathUtils.smoothstep(point.z, .02, .09);
    const skirt = (1 - MathUtils.smoothstep(point.y, .93, 1.05)) * (1 - MathUtils.smoothstep(Math.abs(point.x), .08, .128));
    const bodice = MathUtils.smoothstep(point.y, 1.08, 1.13) * (1 - MathUtils.smoothstep(point.y, 1.295, 1.33))
      * (1 - MathUtils.smoothstep(Math.abs(point.x), .052, .069));
    regions[vertex * 2] = Math.max(skirt, bodice) * front * (1 - cuff);
    regions[vertex * 2 + 1] = Math.max(cuff, MathUtils.smoothstep(point.y, 1.415, 1.493));
  }
  const color = new Float32BufferAttribute(new Float32Array(position.count * 3), 3);
  prepared.setAttribute("color", color);
  return { prepared, color, regions };
}

/** Sample the outer cloth, including its joint weights, so the laces bend with the bodice. */
function laceGown(meshes: SkinnedMesh[], skeleton: Skeleton) {
  const surfaces = meshes.flatMap(({ geometry }) => {
    const indices = geometry.getIndex();
    return indices ? [{ cloth: geometry, tree: new MeshBVH(new BufferGeometry()
      .setAttribute("position", geometry.getAttribute("position")).setIndex(indices.clone())) }] : [];
  });
  const ray = new Ray(new Vector3(), new Vector3(0, 0, -1));
  const triangle = new Triangle(), bary = new Vector3();
  const positions: number[] = [], indices: number[] = [], samples: JointWeights[] = [];
  try {
    for (let row = 0; row < 6; row++) for (const side of [-1, 1]) {
      const offset = positions.length / 3;
      const y = 1.137 + row * .026;
      const corners = [];
      for (let i = 0; i <= 8; i++) for (const edge of [-1, 1]) {
        ray.origin.set(side * MathUtils.lerp(.038, -.038, i / 8), y + i * .026 / 8 + edge * .0019, .45);
        const nearest = surfaces.flatMap(surface => {
          const hit = surface.tree.raycastFirst(ray, DoubleSide);
          return hit?.face ? [{ hit, cloth: surface.cloth, face: hit.face }] : [];
        }).sort((a, b) => a.hit.distance - b.hit.distance)[0];
        if (!nearest) continue;
        const { hit, face: { a, b, c }, cloth } = nearest;
        triangle.setFromAttributeAndIndices(cloth.getAttribute("position"), a, b, c);
        if (!triangle.getBarycoord(hit.point, bary)) continue;
        const skin: JointWeights = new Map();
        addSkin(skin, cloth, a, bary.x);
        addSkin(skin, cloth, b, bary.y);
        addSkin(skin, cloth, c, bary.z);
        corners.push({ skin, point: hit.point.add(new Vector3(0, 0, side > 0 ? .0048 : .0025)) });
      }
      if (corners.length !== 18) continue;
      for (const { skin, point } of corners) {
        samples.push(skin);
        positions.push(point.x, point.y, point.z);
      }
      for (let i = 0; i < 16; i += 2) indices.push(offset + i, offset + i + 2, offset + i + 1, offset + i + 1, offset + i + 2, offset + i + 3);
    }
  } finally { for (const { tree } of surfaces) tree.geometry.dispose(); }
  if (!indices.length) return;
  const geometry = new BufferGeometry().setIndex(indices).setAttribute("position", new Float32BufferAttribute(positions, 3));
  const joints = new Uint16Array(samples.length * 4), weights = new Float32Array(joints.length);
  samples.forEach((skin, vertex) => writeSkin(skin, joints, weights, vertex));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(joints, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  geometry.computeVertexNormals();
  const laces = new SkinnedMesh(geometry, new MeshStandardMaterial({ side: DoubleSide, roughness: .76 }));
  laces.name = "gown-bodice-laces";
  laces.frustumCulled = false;
  laces.bind(skeleton, meshes[0].bindMatrix);
  return laces;
}

export function prepareHoodedGown(meshes: SkinnedMesh[], skeleton: Skeleton) {
  const cloth = meshes.flatMap(mesh => {
    if (!mesh.name.startsWith("CLOTH_MEDIEVAL_05_") || !(mesh.material instanceof MeshStandardMaterial)) return [];
    const part = gownCloth(mesh.geometry, skeleton);
    mesh.geometry = part.prepared;
    mesh.material.color.set(0xffffff);
    mesh.material.vertexColors = true;
    return [{ ...part, mesh }];
  });
  if (!cloth.length) return;
  const laces = laceGown(cloth.map(({ mesh }) => mesh), skeleton);
  const palette = HOODED_GOWN_DYES.map(dye => new Color(dye.original));
  const tint = new Color();
  let applied: string | undefined;
  return {
    laces,
    apply(dyes?: PieceColors, outfitFabric?: string, outfitAccent?: string) {
      const values = [
        dyes?.color ?? outfitFabric ?? HOODED_GOWN_DYES[0].original,
        dyes?.panel ?? HOODED_GOWN_DYES[1].original,
        dyes?.accent ?? outfitAccent ?? HOODED_GOWN_DYES[2].original,
        dyes?.laces ?? HOODED_GOWN_DYES[3].original,
      ];
      const key = values.join(":");
      if (key === applied) return;
      applied = key;
      values.forEach((value, index) => palette[index].set(value));
      for (const { color, regions } of cloth) {
        for (let i = 0; i < color.count; i++) {
          tint.copy(palette[0]).lerp(palette[1], regions[i * 2]).lerp(palette[2], regions[i * 2 + 1]);
          color.setXYZ(i, tint.r, tint.g, tint.b);
        }
        color.needsUpdate = true;
      }
      laces?.material.color.copy(palette[3]);
    },
    dispose() {
      for (const { prepared } of cloth) prepared.dispose();
      laces?.geometry.dispose();
      laces?.material.dispose();
    },
  };
}
