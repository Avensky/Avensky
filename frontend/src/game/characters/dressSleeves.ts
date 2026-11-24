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

type SleeveArm = NonNullable<ReturnType<typeof sleeveArm>>;
const profileSteps = 16;

function armCoordinates(arm: SleeveArm, point: Vector3, scratch: Vector3, center: Vector3) {
  scratch.copy(point).sub(arm.elbow);
  const bend = scratch.dot(arm.bendAxis);
  const forearm = scratch.dot(arm.forearm) / arm.lowerLengthSquared;
  const upper = scratch.copy(point).sub(arm.shoulder).dot(arm.upperAxis) / arm.upperLengthSquared;
  // Blend the centerlines at the bend so the crease has no jump across the seam.
  center.copy(arm.shoulder).addScaledVector(arm.upperAxis, MathUtils.clamp(upper, 0, 1));
  scratch.copy(arm.elbow).addScaledVector(arm.forearm, MathUtils.clamp(forearm, 0, 1.1));
  center.lerp(scratch, MathUtils.smoothstep(bend, -.04, .04));
  const segment = bend < 0 ? MathUtils.clamp(upper, 0, .999) : 1 + MathUtils.clamp(forearm, 0, .999);
  return { bend, forearm, upper, section: segment * profileSteps };
}

function armInfluence(arm: SleeveArm, geometry: BufferGeometry, vertex: number) {
  const joints = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
  let influence = 0;
  for (let channel = 0; channel < 4; channel++) {
    if (arm.joints[joints.getComponent(vertex, channel)]) influence += weights.getComponent(vertex, channel);
  }
  return influence;
}

function rearProfile(arm: SleeveArm, skin: BufferGeometry) {
  const position = skin.getAttribute("position");
  const bins = new Float32Array(profileSteps * 2);
  const point = new Vector3(), scratch = new Vector3(), center = new Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (armInfluence(arm, skin, vertex) < .72) continue;
    point.fromBufferAttribute(position, vertex);
    const { section } = armCoordinates(arm, point, scratch, center);
    const bin = Math.floor(section);
    bins[bin] = Math.max(bins[bin], center.z - point.z);
  }
  return bins.map((depth, i) => Math.max(.021, depth, bins[i - 1] ?? 0, bins[i + 1] ?? 0));
}

function profileAt(rear: Float32Array, section: number) {
  const sample = MathUtils.clamp(section - .5, 0, rear.length - 1);
  const lo = Math.floor(sample), hi = Math.min(lo + 1, rear.length - 1);
  return MathUtils.lerp(rear[lo], rear[hi], sample - lo);
}

/** Fit to the actor's open arms in bind space, including the sleeve root at the shoulder. */
export function prepareDressSleeves(skeleton: Skeleton, fittedLinen: boolean, body?: BufferGeometry) {
  const left = sleeveArm(skeleton, "l"), right = sleeveArm(skeleton, "r");
  if (!left || !right) return;
  const rearLeft = fittedLinen && body && rearProfile(left, body);
  const rearRight = fittedLinen && body && rearProfile(right, body);
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
      const across = Math.abs(point.x);
      if (point.y < .84 || point.y > 1.44 || across < (fittedLinen ? .129 : .147)) continue;
      const arm = point.x > 0 ? left : right;
      const rear = point.x > 0 ? rearLeft : rearRight;
      const { bend, forearm, upper, section } = armCoordinates(arm, point, offset, center);
      const radius = offset.copy(point).sub(center).length();
      // Use the bind-space joint positions here. Wide corners can be far from
      // the skin and still belong below the elbow, even with old upper-arm weights.
      const shoulder = MathUtils.smoothstep(upper, .035, .42) * MathUtils.smoothstep(across, .147, .22);
      const axisSupport = shoulder * (1 - MathUtils.smoothstep(radius, .042, .09));
      const sleeve = Math.max(MathUtils.smoothstep(armInfluence(arm, source, i), .37, .85), .8 * axisSupport);
      const amount = sleeve * Math.max(.88 * shoulder, MathUtils.smoothstep(bend, -.12, -.015));
      const linenFit = fittedLinen ? sleeve * MathUtils.smoothstep(upper, .09, .42) : 0;
      // The rear shoulder fold spans the sleeve and clavicle. Fit that seam
      // even where the authored torso weights dilute its arm influence.
      const rearShoulder = rear ? MathUtils.smoothstep(across, .129, .159) * MathUtils.smoothstep(point.y, 1.235, 1.303)
        * (1 - MathUtils.smoothstep(point.y, 1.371, 1.414)) : 0;
      const rearFit = rear ? Math.max(rearShoulder, sleeve * MathUtils.smoothstep(upper, .015, .25)
        * MathUtils.smoothstep(across, .147, .202)) : 0;
      if (Math.max(amount, linenFit, rearFit) < .001) continue;
      const lower = MathUtils.smoothstep(bend, -.042, .062);
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
      if (Math.max(linenFit, rearFit) < .001) continue;
      const clearance = MathUtils.lerp(.044, .034, MathUtils.clamp(forearm, 0, 1));
      // Narrow the ballooning cloth and keep the original band a separate,
      // slightly raised layer. Move its UVs with the cloth.
      const ease = Math.max(0, radius - clearance) * .65 * linenFit;
      const allowance = sleeveBinding ? .005 * linenFit : 0;
      if (radius < .001) continue;
      point.addScaledVector(offset, (allowance - ease) / radius);
      if (rear) {
        const depth = Math.max(profileAt(rear, section), .046 * rearShoulder);
        const excess = center.z - point.z - depth - .007 - allowance;
        point.z += Math.max(0, excess) * rearFit;
      }
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
