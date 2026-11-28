// Stay just short of the poles so the horizon has a stable up direction.
export const GARAGE_POLE_MARGIN = .005;
const maxElevation = Math.PI / 2 - GARAGE_POLE_MARGIN;

export function clampGarageElevation(radians: number) {
  return Math.max(-maxElevation, Math.min(maxElevation, radians));
}

/** The resting view repeats every revolution. Ease to the nearest equivalent heading. */
export function nearestRestYaw(yaw: number) {
  const turn = Math.PI * 2;
  return Math.round(yaw / turn) * turn;
}
