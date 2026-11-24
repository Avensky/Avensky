import { BufferGeometry, MathUtils, Triangle, Vector3, type Skeleton } from "three";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";

export const HOODED_GOWN = "medieval-05";

export function needsCloseDressFit(id: string) {
  return id !== HOODED_GOWN && (id === "linen-nightgown" || /^(?:medieval-(?:kaftan-)?|sleepwear-)\d+$/.test(id));
}

function armSides(skeleton: Skeleton) {
  return skeleton.bones.map(({ name }) => /^(?:upperarm|lowerarm|hand)(?:_twist_\d+)?_([lr])$/.exec(name)?.[1]);
}

function vertexArm(geometry: BufferGeometry, arms: ReturnType<typeof armSides>, vertex: number) {
  const indices = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
  let left = 0, right = 0;
  for (let channel = 0; channel < 4; channel++) {
    const side = arms[indices.getComponent(vertex, channel)];
    if (side === "l") left += weights.getComponent(vertex, channel);
    if (side === "r") right += weights.getComponent(vertex, channel);
  }
  return left > .55 ? 1 : right > .55 ? 2 : 0;
}

/** Take in the upper panels against the rest-pose skin; retain the skirt below the hips. */
export function prepareCloseDressFit(body: BufferGeometry, skeleton: Skeleton) {
  const index = body.getIndex(), skin = body.getAttribute("position"), normals = body.getAttribute("normal");
  if (!index || !skin || !normals || !body.hasAttribute("skinIndex") || !body.hasAttribute("skinWeight")) return;
  const arms = armSides(skeleton);
  const parts = [[], [], []] as number[][];
  const classifications = Uint8Array.from({ length: skin.count }, (_, vertex) => vertexArm(body, arms, vertex));
  for (let face = 0; face < index.count; face += 3) {
    const a = index.getX(face), b = index.getX(face + 1), c = index.getX(face + 2);
    if (Math.max(skin.getY(a), skin.getY(b), skin.getY(c)) < .87) continue;
    const groups = new Set([classifications[a], classifications[b], classifications[c]]);
    for (const group of groups) parts[group].push(a, b, c);
  }
  const surfaces = parts.map(indices => {
    if (!indices.length) return;
    const geometry = new BufferGeometry().setAttribute("position", skin).setIndex(indices);
    return new MeshBVH(geometry);
  });
  const point = new Vector3(), normal = new Vector3(), sample = new Vector3(), bary = new Vector3();
  const triangle = new Triangle();
  const hit: HitPointInfo = { point: new Vector3(), faceIndex: 0, distance: 0 };
  return {
    fit(source: BufferGeometry) {
      const cloth = source.getAttribute("position");
      if (!cloth || !source.hasAttribute("skinIndex") || !source.hasAttribute("skinWeight")) return;
      let fitted: BufferGeometry | undefined;
      for (let vertex = 0; vertex < cloth.count; vertex++) {
        point.fromBufferAttribute(cloth, vertex);
        if (point.y <= .90 || point.y >= 1.46) continue;
        const arm = vertexArm(source, arms, vertex);
        const blend = arm ? .86 * MathUtils.smoothstep(point.y, .9, 1.04)
          : .91 * MathUtils.smoothstep(point.y, .91, 1.06) * (1 - MathUtils.smoothstep(point.y, 1.385, 1.46));
        const surface = surfaces[arm];
        const indices = surface?.geometry.getIndex();
        if (!indices || !surface?.closestPointToPoint(point, hit, 0, .095)) continue;
        const a = indices.getX(hit.faceIndex * 3), b = indices.getX(hit.faceIndex * 3 + 1), c = indices.getX(hit.faceIndex * 3 + 2);
        triangle.setFromAttributeAndIndices(skin, a, b, c);
        if (!triangle.getBarycoord(hit.point, bary)) continue;
        normal.set(0, 0, 0).addScaledVector(sample.fromBufferAttribute(normals, a), bary.x)
          .addScaledVector(sample.fromBufferAttribute(normals, b), bary.y)
          .addScaledVector(sample.fromBufferAttribute(normals, c), bary.z).normalize();
        const gap = sample.copy(point).sub(hit.point).dot(normal);
        // Pull the loose surface toward the skin without snapping folds or crossing the body.
        const adjustment = MathUtils.clamp(.007 - gap, -.058, .025) * blend;
        if (Math.abs(adjustment) < .0007) continue;
        fitted ??= source.clone();
        point.addScaledVector(normal, adjustment);
        fitted.getAttribute("position").setXYZ(vertex, point.x, point.y, point.z);
      }
      if (fitted) {
        fitted.computeVertexNormals();
        if (fitted.hasAttribute("tangent") && fitted.hasAttribute("uv") && fitted.getIndex()) fitted.computeTangents();
        fitted.computeBoundingBox();
        fitted.computeBoundingSphere();
      }
      return fitted;
    },
    dispose() { for (const surface of surfaces) surface?.geometry.dispose(); },
  };
}
