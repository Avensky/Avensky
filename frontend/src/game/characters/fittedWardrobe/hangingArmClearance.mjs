import { Quaternion, Vector3 } from 'three';

/** Keep the resting upper arm outside the fitted ribs. */
export function prepareHangingArmClearance(root) {
  const arms = ['l', 'r'].flatMap(side => {
    const shoulder = root.getObjectByName(`upperarm_${side}`);
    const elbow = root.getObjectByName(`lowerarm_${side}`);
    return shoulder?.parent && elbow ? [{ shoulder, elbow, sign: side === 'l' ? 1 : -1, saved: new Quaternion() }] : [];
  });
  const rootMatrix = new Quaternion(), inverseParent = new Quaternion(), turn = new Quaternion();
  const lateral = new Vector3(), up = new Vector3(), direction = new Vector3(), outside = new Vector3();
  const elbowPoint = new Vector3(), shoulderPoint = new Vector3();
  let turned = false;

  return {
    apply() {
      root.getWorldQuaternion(rootMatrix);
      lateral.set(1, 0, 0).applyQuaternion(rootMatrix);
      up.set(0, 1, 0).applyQuaternion(rootMatrix);
      for (const { shoulder, elbow, sign, saved } of arms) {
        saved.copy(shoulder.quaternion);
        direction.subVectors(elbow.getWorldPosition(elbowPoint), shoulder.getWorldPosition(shoulderPoint)).normalize();
        const side = sign * direction.dot(lateral);
        const dropped = -direction.dot(up);
        if (dropped < .94 || side >= .15) continue;
        const spread = (.15 - side) * Math.min(1, (dropped - .94) / .045);
        outside.copy(direction).addScaledVector(lateral, sign * spread).normalize();
        shoulder.parent.getWorldQuaternion(inverseParent).invert();
        turn.setFromUnitVectors(direction.applyQuaternion(inverseParent), outside.applyQuaternion(inverseParent));
        shoulder.quaternion.premultiply(turn);
      }
      turned = true;
    },
    restore() {
      if (!turned) return;
      for (const { shoulder, saved } of arms) shoulder.quaternion.copy(saved);
      turned = false;
    },
  };
}
