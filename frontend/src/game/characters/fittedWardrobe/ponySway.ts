import { Quaternion, Vector2, Vector3, type Object3D } from "three";

export function createPonySway(root: Object3D, head: Object3D) {
  const axis = new Vector3();
  const rotation = new Quaternion();
  const rootRotation = new Quaternion();
  const previous = new Vector2();
  const velocity = new Vector2();
  const displacement = new Vector2();
  const offset = new Vector3();
  let initialized = false;
  return {
    offset,
    step(delta: number, enabled: boolean) {
      if (!enabled) {
        const reset = offset.lengthSq() > 0;
        initialized = false;
        velocity.set(0, 0);
        displacement.set(0, 0);
        offset.set(0, 0, 0);
        return reset;
      }
      head.getWorldQuaternion(rotation).premultiply(root.getWorldQuaternion(rootRotation).invert());
      axis.set(0, 0, 1).applyQuaternion(rotation);
      if (!initialized) {
        previous.set(axis.x, axis.y);
        initialized = true;
        return false;
      }
      const elapsed = Math.max(1 / 240, Math.min(delta, .2));
      const driveTime = Math.min(elapsed, .075);
      const driveX = Math.max(-.012, Math.min(.012, (previous.x - axis.x) * .0034 / driveTime));
      const driveY = Math.min(.006, Math.abs(previous.y - axis.y) * .0023 / driveTime);
      previous.set(axis.x, axis.y);
      const steps = Math.ceil(elapsed * 60);
      const dt = elapsed / steps;
      for (let i = 0; i < steps; i++) {
        velocity.x += ((driveX - displacement.x) * 290 - velocity.x * 23) * dt;
        velocity.y += ((driveY - displacement.y) * 290 - velocity.y * 23) * dt;
        displacement.addScaledVector(velocity, dt);
      }
      const moving = Math.abs(driveX) + driveY + displacement.length() + velocity.length() > .00012;
      if (!moving) displacement.set(0, 0);
      // The loose ends sway laterally and away from their resting surface.
      offset.set(Math.max(-.009, Math.min(.009, displacement.x)), 0,
        -Math.min(.007, Math.abs(displacement.x) * .40 + Math.max(0, displacement.y)));
      return moving;
    },
  };
}
