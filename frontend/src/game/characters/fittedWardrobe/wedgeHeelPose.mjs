import { Quaternion, Vector3 } from "three";

const heelPitch = .105;
const heelLift = .017;

export function prepareWedgeHeelPose(root) {
  const feet = ["foot_l", "foot_r"].flatMap(name => {
    const bone = root.getObjectByName(name);
    return bone?.parent ? [{ bone, animated: bone.quaternion.clone() }] : [];
  });
  const rootRotation = new Quaternion(), parentRotation = new Quaternion(), tilt = new Quaternion();
  const axis = new Vector3();
  let animatedHeight = 0;
  let applied = false;

  function restore() {
    if (!applied) return;
    root.position.y = animatedHeight;
    for (const { bone, animated } of feet) bone.quaternion.copy(animated);
    applied = false;
  }

  function apply() {
    if (applied) return;
    animatedHeight = root.position.y;
    root.position.y += heelLift;
    root.getWorldQuaternion(rootRotation);
    for (const { bone, animated } of feet) {
      animated.copy(bone.quaternion);
      bone.parent.getWorldQuaternion(parentRotation).invert();
      axis.set(1, 0, 0).applyQuaternion(rootRotation).applyQuaternion(parentRotation);
      tilt.setFromAxisAngle(axis, heelPitch);
      bone.quaternion.copy(animated).premultiply(tilt);
    }
    applied = true;
  }

  return { restore, apply };
}
