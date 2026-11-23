import { MathUtils, Quaternion, Vector3, type Object3D } from "three";
import { aimLimb, driverArm } from "../characters/garageEmotes";

type PathSample = (distance: number, position: Vector3, forward: Vector3) => void;

/** Walk in the garage frame so a planted shoe stays fixed while the pelvis travels. */
export function prepareBrzGait(root: Object3D, car: Object3D, length: number, samplePath: PathSample, finalFacing: Vector3) {
  const parent = root.parent;
  if (length < .04 || !parent) return undefined;
  const legs = (["l", "r"] as const).flatMap(side => {
    const thigh = root.getObjectByName(`thigh_${side}`), calf = root.getObjectByName(`calf_${side}`), foot = root.getObjectByName(`foot_${side}`);
    return thigh && calf && foot ? [{ thigh, calf, foot }] : [];
  });
  if (legs.length !== 2) return undefined;
  const arms = [driverArm(root, "l"), driverArm(root, "r")];
  const joints = [...legs.flatMap(leg => [leg.thigh, leg.calf, leg.foot]), ...arms.flatMap(arm => arm ? [arm.shoulder, arm.elbow] : [])];
  const rest = joints.map(joint => ({ joint, rotation: joint.quaternion.clone() }));
  const height = root.position.y, up = new Vector3(0, 1, 0);
  const rootRotation = root.getWorldQuaternion(new Quaternion());
  const footBaseline = legs.map(leg => rootRotation.clone().invert().multiply(leg.foot.getWorldQuaternion(new Quaternion())));
  const home = legs.map(leg => car.worldToLocal(leg.foot.getWorldPosition(new Vector3())));
  const hipHeight = root.worldToLocal(legs[0].thigh.getWorldPosition(new Vector3())).y;
  const stride = MathUtils.clamp(hipHeight * .47, .30, .46);
  const count = Math.max(2, Math.ceil(length / stride));
  const span = length / count;
  const width = MathUtils.clamp(home[0].distanceTo(home[1]) / 2, .065, .11);
  const points = home.map(position => ({ position, direction: new Vector3(0, 0, 1) }));
  samplePath(0, new Vector3(), points[0].direction);
  points[1].direction.copy(points[0].direction);
  const frames = Array.from({ length: count }, (_, index) => {
    const side = index % 2;
    const to = new Vector3(), direction = new Vector3();
    const final = index >= count - 2;
    samplePath(final ? length : Math.min(length, span * (index + 1.48)), to, direction);
    if (final) direction.copy(finalFacing);
    to.addScaledVector(new Vector3().crossVectors(up, direction), side === 0 ? width : -width);
    to.y = home[side].y;
    const from = points[side], planted = points[1 - side];
    points[side] = { position: to, direction };
    return { side, from, planted, to, direction };
  });
  const targets = legs.map(leg => {
    const toParent = (joint: Object3D) => parent.worldToLocal(joint.getWorldPosition(new Vector3()));
    const knee = toParent(leg.calf);
    return {
      reach: knee.distanceTo(toParent(leg.thigh)) + knee.distanceTo(toParent(leg.foot)) - .002,
      ankle: new Vector3(),
      heading: new Vector3(),
    };
  });
  const hip = new Vector3(), relative = new Vector3(), pole = new Vector3(), localAxis = new Vector3();
  const rotation = new Quaternion(), inverse = new Quaternion(), groundRotation = new Quaternion();
  const shoe = new Quaternion(), roll = new Quaternion(), carAxis = new Quaternion();
  const reset = () => { root.position.y = height; rest.forEach(({ joint, rotation }) => joint.quaternion.copy(rotation)); };
  return {
    sample(distance: number) {
      reset();
      const index = Math.min(count - 1, Math.floor(distance / span));
      const phase = MathUtils.clamp(distance / span - index, 0, 1);
      const swing = frames[index];
      const lift = Math.sin(Math.PI * phase);
      const momentum = Math.min(1, distance / .23, (length - distance) / .23);
      let drop = (.036 + .012 * Math.cos(2 * Math.PI * phase)) * momentum;
      for (const [side, target] of targets.entries()) {
        if (side === swing.side) {
          const travel = MathUtils.smootherstep(phase, 0, 1);
          target.ankle.lerpVectors(swing.from.position, swing.to, travel);
          target.ankle.y += lift * Math.min(.10, span * .27);
          target.heading.lerpVectors(swing.from.direction, swing.direction, travel).normalize();
        } else {
          target.ankle.copy(swing.planted.position);
          target.heading.copy(swing.planted.direction);
        }
        car.localToWorld(target.ankle);
        parent.worldToLocal(legs[side].thigh.getWorldPosition(hip));
        parent.worldToLocal(relative.copy(target.ankle)).sub(hip);
        // Lower the pelvis just enough for the farther shoe to stay within reach.
        const vertical = Math.sqrt(Math.max(0, target.reach ** 2 - relative.x ** 2 - relative.z ** 2));
        drop = Math.max(drop, -relative.y - vertical);
      }
      root.position.y -= drop;
      car.getWorldQuaternion(carAxis);
      root.getWorldQuaternion(rotation);
      for (const [side, leg] of legs.entries()) {
        const target = targets[side];
        pole.set(side === 0 ? .13 : -.13, 0, 1).applyQuaternion(rotation);
        aimLimb(leg.thigh, leg.calf, leg.foot, target.ankle, pole);
        shoe.setFromAxisAngle(up, Math.atan2(target.heading.x, target.heading.z));
        localAxis.set(1, 0, 0);
        roll.setFromAxisAngle(localAxis, side === swing.side ? .17 * Math.sin(2 * Math.PI * phase) : 0);
        groundRotation.copy(carAxis).multiply(shoe).multiply(roll).multiply(footBaseline[side]);
        leg.foot.quaternion.copy(leg.calf.getWorldQuaternion(inverse).invert().multiply(groundRotation));
      }
      const swingAngle = Math.cos(phase * Math.PI) * (swing.side === 0 ? 1 : -1) * .32 * momentum;
      for (const [side, arm] of arms.entries()) if (arm?.shoulder.parent) {
        localAxis.set(1, 0, 0).applyQuaternion(rotation).applyQuaternion(arm.shoulder.parent.getWorldQuaternion(inverse).invert());
        arm.shoulder.quaternion.premultiply(roll.setFromAxisAngle(localAxis, side === 0 ? swingAngle : -swingAngle));
        arm.elbow.rotateZ((side === 0 ? 1 : -1) * .06 * momentum);
      }
    },
    stop: reset,
  };
}
