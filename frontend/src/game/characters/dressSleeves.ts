import { Float32BufferAttribute, MathUtils, Uint16BufferAttribute, Vector3, type BufferGeometry, type Skeleton } from "three";
import { rebuildShortSkirtFabricNormals as rebuildClothNormals } from "./shortSkirtFabric";

function sleeveArm(skeleton: Skeleton, side: "l" | "r") {
  const names = ["upperarm", "lowerarm", "hand"].map(name => `${name}_${side}`);
  const [upper, lower, hand] = names.map(name => skeleton.bones.findIndex(bone => bone.name === name));
  if (Math.min(upper, lower, hand) < 0) return;
  const [shoulder, elbow, wrist] = [upper, lower, hand].map(joint =>
    new Vector3().setFromMatrixPosition(skeleton.boneInverses[joint].clone().invert()));
  const upperAxis = elbow.clone().sub(shoulder);
  const forearm = wrist.clone().sub(elbow);
  const upperLengthSquared = upperAxis.lengthSq(), lowerLengthSquared = forearm.lengthSq();
  if (Math.min(upperLengthSquared, lowerLengthSquared) < 1e-8) return;
  const bendAxis = upperAxis.clone().normalize().add(forearm.clone().normalize()).normalize();
  const joints = skeleton.bones.map(({ name }) => /^(?:upperarm|lowerarm|hand)(?:_twist_\d+)?_[lr]$/.test(name) && name.endsWith(`_${side}`));
  return { upper, lower, hand, shoulder, elbow, upperAxis, forearm, bendAxis, joints,
    upperLengthSquared, lowerLengthSquared };
}

/** Bind fabric and its separate bands to the same elbow and wrist transitions. */
export function prepareDressSleeves(skeleton: Skeleton, fittedLinen: boolean) {
  const left = sleeveArm(skeleton, "l"), right = sleeveArm(skeleton, "r");
  if (!left || !right) return;
  const point = new Vector3(), offset = new Vector3(), center = new Vector3();

  return (source: BufferGeometry, fitted?: BufferGeometry, sleeveBinding = false) => {
    const position = source.getAttribute("position"), joints = source.getAttribute("skinIndex"), weights = source.getAttribute("skinWeight");
    if (!position || !joints || !weights) return fitted;
    const skin = fitted ?? source;
    const skinJoints = skin.getAttribute("skinIndex"), skinWeights = skin.getAttribute("skinWeight");
    let result = fitted;
    let indices: Uint16BufferAttribute | undefined, influences: Float32BufferAttribute | undefined;
    let reshaped = false;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      if (point.y < .84 || point.y > 1.44 || Math.abs(point.x) < .175) continue;
      const arm = point.x > 0 ? left : right;
      let armWeight = 0;
      for (let channel = 0; channel < 4; channel++) {
        if (arm.joints[joints.getComponent(i, channel)]) armWeight += weights.getComponent(i, channel);
      }
      // Use the bind-space joint positions here. Wide corners can be far from
      // the skin and still belong below the elbow, even with old upper-arm weights.
      const elbowDistance = offset.copy(point).sub(arm.elbow).dot(arm.bendAxis);
      const forearm = offset.dot(arm.forearm) / arm.lowerLengthSquared;
      const sleeve = MathUtils.smoothstep(armWeight, .42, .86);
      const amount = sleeve * MathUtils.smoothstep(elbowDistance, -.12, -.015);
      const upper = offset.copy(point).sub(arm.shoulder).dot(arm.upperAxis) / arm.upperLengthSquared;
      const linenFit = fittedLinen ? sleeve * MathUtils.smoothstep(upper, .12, .57) : 0;
      if (Math.max(amount, linenFit) < .001) continue;
      const lower = MathUtils.smoothstep(elbowDistance, -.042, .062);
      const wrist = .48 * MathUtils.smoothstep(forearm, .67, 1.12);
      const blend = new Map<number, number>();
      for (let channel = 0; channel < 4; channel++) {
        const joint = skinJoints.getComponent(i, channel);
        const weight = skinWeights.getComponent(i, channel) * (1 - amount);
        if (weight > 0) blend.set(joint, (blend.get(joint) ?? 0) + weight);
      }
      blend.set(arm.upper, (blend.get(arm.upper) ?? 0) + amount * (1 - lower));
      blend.set(arm.lower, (blend.get(arm.lower) ?? 0) + amount * lower * (1 - wrist));
      blend.set(arm.hand, (blend.get(arm.hand) ?? 0) + amount * lower * wrist);
      const strongest = [...blend].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
      const total = strongest.reduce((sum, [, weight]) => sum + weight, 0);
      result ??= source.clone();
      indices ??= new Uint16BufferAttribute(Array.from({ length: position.count * 4 },
        (_, j) => skinJoints.getComponent(j >> 2, j % 4)), 4);
      influences ??= new Float32BufferAttribute(Array.from({ length: position.count * 4 },
        (_, j) => skinWeights.getComponent(j >> 2, j % 4)), 4);
      for (let channel = 0; channel < 4; channel++) {
        const [joint, weight] = strongest[channel] ?? [0, 0];
        indices.setComponent(i, channel, joint);
        influences.setComponent(i, channel, weight / total);
      }
      if (linenFit < .001) continue;
      if (elbowDistance < 0) center.copy(arm.shoulder).addScaledVector(arm.upperAxis, MathUtils.clamp(upper, 0, 1));
      else center.copy(arm.elbow).addScaledVector(arm.forearm, MathUtils.clamp(forearm, 0, 1.10));
      const radius = offset.copy(point).sub(center).length();
      const clearance = MathUtils.lerp(.044, .034, MathUtils.clamp(forearm, 0, 1));
      // Narrow the ballooning cloth and keep the original band a separate,
      // slightly raised layer. Move its UVs with the cloth.
      const ease = Math.max(0, radius - clearance) * .65 * linenFit;
      const allowance = sleeveBinding ? .005 * linenFit : 0;
      if (radius < .001 || Math.abs(allowance - ease) < .0001) continue;
      point.addScaledVector(offset, (allowance - ease) / radius);
      result.getAttribute("position").setXYZ(i, point.x, point.y, point.z);
      reshaped = true;
    }
    if (result && indices && influences) {
      result.setAttribute("skinIndex", indices);
      result.setAttribute("skinWeight", influences);
      if (reshaped) {
        rebuildClothNormals(source, result);
        result.computeBoundingBox();
        result.computeBoundingSphere();
      }
    }
    return result;
  };
}
