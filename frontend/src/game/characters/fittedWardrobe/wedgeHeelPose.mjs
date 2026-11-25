import { Quaternion, Vector3 } from "three";
export const HEEL_PITCH = .20;
export const TOE_PITCH = -.17;
export const HEEL_LIFT = .032;
export const WEDGE_FIT_PIVOTS = {
  ankle: [0, .008, .003],
  toes: [0, .003, .014],
  // The unmodified wedge has a flat base in bind pose.
  standingAnklePitch: 0,
  standingToePitch: 0,
  lift: 0,
};


export function prepareWedgeHeelPose(root, pivots) {
  const restRootRotation = root.getWorldQuaternion(new Quaternion());
  const localOffset = (bone, offset) => new Vector3(...offset)
    .applyQuaternion(restRootRotation).applyQuaternion(bone.getWorldQuaternion(new Quaternion()).invert());
  const feet = ["l", "r"].flatMap(side => {
    const ankle = root.getObjectByName("foot_" + side);
    const toes = root.getObjectByName("ball_" + side);
    return ankle?.parent && toes?.parent ? [{ ankle, toes,
      ankleOffset: pivots && localOffset(ankle, pivots.ankle),
      toeOffset: pivots && localOffset(toes, pivots.toes),
      animatedAnkle: ankle.quaternion.clone(), animatedToes: toes.quaternion.clone(),
      anklePosition: ankle.position.clone(), toePosition: toes.position.clone() }] : [];
  });
  const rootRotation = new Quaternion(), parentRotation = new Quaternion(), tilt = new Quaternion();
  const axis = new Vector3();
  const pivot = new Vector3(), rotatedPivot = new Vector3();
  let animatedHeight = 0;
  let applied = false;

  function restore() {
    if (!applied) return;
    root.position.y = animatedHeight;
    for (const { ankle, toes, animatedAnkle, animatedToes, anklePosition, toePosition } of feet) {
      ankle.quaternion.copy(animatedAnkle);
      toes.quaternion.copy(animatedToes);
      ankle.position.copy(anklePosition);
      toes.position.copy(toePosition);
    }
    applied = false;
  }

  function pitch(bone, radians, offset) {
    bone.parent.getWorldQuaternion(parentRotation).invert();
    axis.set(1, 0, 0).applyQuaternion(rootRotation).applyQuaternion(parentRotation);
    tilt.setFromAxisAngle(axis, radians);
    if (offset) {
      // Translate by the difference so the offset point stays fixed during rotation.
      pivot.copy(offset).applyQuaternion(bone.quaternion);
      bone.position.add(pivot).sub(rotatedPivot.copy(pivot).applyQuaternion(tilt));
    }
    bone.quaternion.premultiply(tilt);
  }

  function apply(seated = false) {
    if (applied) return;
    animatedHeight = root.position.y;
    if (!seated) root.position.y += pivots?.lift ?? HEEL_LIFT;
    root.getWorldQuaternion(rootRotation);
    for (const { ankle, toes, animatedAnkle, animatedToes, anklePosition, toePosition, ankleOffset, toeOffset } of feet) {
      animatedAnkle.copy(ankle.quaternion);
      animatedToes.copy(toes.quaternion);
      anklePosition.copy(ankle.position);
      toePosition.copy(toes.position);
      if (!seated) pitch(ankle, pivots?.standingAnklePitch ?? HEEL_PITCH, ankleOffset);
      pitch(toes, seated ? TOE_PITCH * .48 : pivots?.standingToePitch ?? TOE_PITCH, toeOffset);
    }
    applied = true;
  }

  return { restore, apply };
}
