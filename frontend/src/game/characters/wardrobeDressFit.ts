import { BufferGeometry, Float32BufferAttribute, MathUtils, Triangle, Uint16BufferAttribute, Vector3, type Skeleton } from "three";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";

export const HOODED_GOWN = "medieval-05";

export function usesLongGownFit(id: string) {
  return id === "medieval-02" || id === "linen-nightgown";
}

export function needsCloseDressFit(id: string) {
  return id === "linen-nightgown" || /^(?:medieval-(?:kaftan-)?|sleepwear-)\d+$/.test(id);
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

function addWeights(weights: Map<number, number>, geometry: BufferGeometry, vertex: number, amount: number) {
  const joints = geometry.getAttribute("skinIndex"), source = geometry.getAttribute("skinWeight");
  for (let channel = 0; channel < 4; channel++) {
    const joint = joints.getComponent(vertex, channel);
    const weight = amount * source.getComponent(vertex, channel);
    if (weight > 0) weights.set(joint, (weights.get(joint) ?? 0) + weight);
  }
}

/** Take in the upper panels against the rest-pose skin; retain the skirt below the hips. */
export function prepareCloseDressFit(body: BufferGeometry, skeleton: Skeleton, id: string) {
  const index = body.getIndex(), skin = body.getAttribute("position"), normals = body.getAttribute("normal");
  if (!index || !skin || !normals || !body.hasAttribute("skinIndex") || !body.hasAttribute("skinWeight")) return;
  const arms = armSides(skeleton);
  const followsBody = usesLongGownFit(id);
  const parts = [[], [], []] as number[][];
  const classifications = Uint8Array.from({ length: skin.count }, (_, vertex) => vertexArm(body, arms, vertex));
  for (let face = 0; face < index.count; face += 3) {
    const a = index.getX(face), b = index.getX(face + 1), c = index.getX(face + 2);
    if (Math.max(skin.getY(a), skin.getY(b), skin.getY(c)) < (followsBody ? .72 : .87)) continue;
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
    fit(source: BufferGeometry, meshName: string) {
      const cloth = source.getAttribute("position");
      if (!cloth || !source.hasAttribute("skinIndex") || !source.hasAttribute("skinWeight")) return;
      let fitted: BufferGeometry | undefined;
      let joints: Uint16BufferAttribute | undefined, weights: Float32BufferAttribute | undefined;
      const nightgownBinding = id === "linen-nightgown" && meshName === "CLOTH_LINEN_NIGHTGOWN_1_1";
      for (let vertex = 0; vertex < cloth.count; vertex++) {
        point.fromBufferAttribute(cloth, vertex);
        // The skirt needs enough ease for the hips to roll onto the seat
        // without pushing the lining through the back of the dress.
        const seatEase = followsBody && point.z < -.025
          ? MathUtils.smoothstep(point.y, .66, .84) * (1 - MathUtils.smoothstep(point.y, .92, 1.01))
            * MathUtils.smoothstep(-point.z, .025, .087) : 0;
        const kneeEase = id === "medieval-02" && point.z > .02
          ? MathUtils.smoothstep(point.y, .36, .50) * (1 - MathUtils.smoothstep(point.y, .57, .73))
            * MathUtils.smoothstep(point.z, .02, .115) : 0;
        if (id === "linen-nightgown" && point.y < .24) {
          // Keep the layered hem above the bare heel across a full stride.
          const hem = 1 - MathUtils.smoothstep(point.y, .13, .24);
          // The separate binding needs a little overlap with the fabric above
          // it. The lighter mesh otherwise opens a seam as its hem flexes.
          const overlap = nightgownBinding ? .032 * MathUtils.smoothstep(point.y, .135, .175) : 0;
          fitted ??= source.clone();
          fitted.getAttribute("position").setXYZ(vertex, point.x * (1 + .035 * hem),
            point.y + .033 * hem + overlap, point.z - .017 * hem);
        }
        if (seatEase || kneeEase) {
          fitted ??= source.clone();
          fitted.getAttribute("position").setXYZ(vertex, point.x * (1 + .065 * seatEase), point.y,
            point.z - .039 * seatEase + .024 * kneeEase);
        }
        if (point.y <= (followsBody ? .77 : .90) || point.y >= 1.46) continue;
        const arm = vertexArm(source, arms, vertex);
        const blend = arm ? (id === "linen-nightgown" ? 0 : .86 * MathUtils.smoothstep(point.y, .9, 1.04))
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
        // The imported blends diverge from the body at the elbows and hips.
        // Keep nearby cloth and trim on the same joints while leaving the free
        // skirt and the flared edges on their original rig.
        const tracking = followsBody && gap > -.026
          ? MathUtils.smoothstep(point.y, .77, .94) * (1 - MathUtils.smoothstep(hit.distance, .038, .078))
            * (1 - MathUtils.smoothstep(point.y, 1.41, 1.46)) : 0;
        if (tracking > .001) {
          fitted ??= source.clone();
          const sourceJoints = source.getAttribute("skinIndex"), sourceWeights = source.getAttribute("skinWeight");
          joints ??= new Uint16BufferAttribute(Array.from({ length: cloth.count * 4 },
            (_, i) => sourceJoints.getComponent(i >> 2, i % 4)), 4);
          weights ??= new Float32BufferAttribute(Array.from({ length: cloth.count * 4 },
            (_, i) => sourceWeights.getComponent(i >> 2, i % 4)), 4);
          const skinning = new Map<number, number>();
          addWeights(skinning, source, vertex, 1 - tracking);
          addWeights(skinning, body, a, bary.x * tracking);
          addWeights(skinning, body, b, bary.y * tracking);
          addWeights(skinning, body, c, bary.z * tracking);
          const strongest = [...skinning].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
          const total = strongest.reduce((sum, [, weight]) => sum + weight, 0);
          for (let channel = 0; channel < 4; channel++) {
            const [joint, weight] = strongest[channel] ?? [0, 0];
            joints.setComponent(vertex, channel, joint);
            weights.setComponent(vertex, channel, weight / total);
          }
        }
        // Pull the loose surface toward the skin without snapping folds or crossing the body.
        const bindingClearance = nightgownBinding && !arm ? .007 : 0;
        const adjustment = MathUtils.clamp((followsBody ? .014 : .007) + bindingClearance - gap, -.058, .025) * blend;
        if (Math.abs(adjustment) < .0007) continue;
        fitted ??= source.clone();
        point.addScaledVector(normal, adjustment);
        fitted.getAttribute("position").setXYZ(vertex, point.x * (1 + .065 * seatEase), point.y,
          point.z - .039 * seatEase + .024 * kneeEase);
      }
      if (fitted) {
        if (joints && weights) {
          fitted.setAttribute("skinIndex", joints);
          fitted.setAttribute("skinWeight", weights);
        }
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
