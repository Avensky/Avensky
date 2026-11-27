// Low-speed bicycle kinematics in garage metres, with the vehicle's nose on +Z.
import { GARAGE_BAY_DOORS } from "./garageDoorLayout.ts";
import { GARAGE_PARKING, GARAGE_PARKING_OBSTACLES, type GarageParkingObstacle } from "./garageServiceLayout.ts";

export type CarFootprint = { width: number; length: number; height: number };
export type GarageCarPose = { x: number; z: number; yaw: number; speed: number };
export type ParkingInput = { throttle: number; steer: number; brake: number };

export function initialGaragePose(): GarageCarPose {
  return { x: GARAGE_PARKING.position[0], z: GARAGE_PARKING.position[2], yaw: GARAGE_PARKING.yaw, speed: 0 };
}

export function bodySpan(footprint: CarFootprint, yaw: number) {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  return { x: (c * footprint.width + s * footprint.length) / 2, z: (s * footprint.width + c * footprint.length) / 2 };
}

// A separation test on the four local axes avoids blocking the clear aisle beside a rotated prop.
function touches(x: number, z: number, yaw: number, car: CarFootprint, obstacle: GarageParkingObstacle) {
  const dx = x - obstacle.x, dz = z - obstacle.z, b = obstacle.yaw ?? 0;
  const w = car.width / 2, l = car.length / 2;
  const c = Math.cos(yaw), s = Math.sin(yaw), cb = Math.cos(b), sb = Math.sin(b);
  const cc = Math.abs(c * cb + s * sb), ss = Math.abs(s * cb - c * sb);
  return Math.abs(dx * c - dz * s) < w + obstacle.halfWidth * cc + obstacle.halfLength * ss &&
    Math.abs(dx * s + dz * c) < l + obstacle.halfWidth * ss + obstacle.halfLength * cc &&
    Math.abs(dx * cb - dz * sb) < obstacle.halfWidth + w * cc + l * ss &&
    Math.abs(dx * sb + dz * cb) < obstacle.halfLength + w * ss + l * cc;
}

export function fitsGarage(x: number, z: number, yaw: number, car: CarFootprint, opening: (bay: number) => number) {
  const span = bodySpan(car, yaw);
  if (x - span.x < -6.6 || x + span.x > 8.5 || z - span.z < -6.16 || z + span.z > 17.85) return false;
  const wall = GARAGE_BAY_DOORS[0].position[2];
  if (Math.abs(z - wall) <= span.z + .15) {
    // Conservative clearance includes both mirrors and bumpers at this steering angle.
    const aligned = GARAGE_BAY_DOORS.findIndex(bay => Math.abs(x - bay.position[0]) + span.x + .035 <= bay.width / 2);
    if (aligned < 0 || opening(aligned) * GARAGE_BAY_DOORS[aligned].height < car.height + .10) return false;
  }
  return !GARAGE_PARKING_OBSTACLES.some(prop => touches(x, z, yaw, car, prop));
}

export function approachBay(pose: GarageCarPose, car: CarFootprint): number {
  const span = bodySpan(car, pose.yaw);
  const distance = Math.abs(GARAGE_BAY_DOORS[0].position[2] - pose.z) - span.z;
  if (distance > 3.1) return -1;
  return GARAGE_BAY_DOORS.findIndex(bay => Math.abs(bay.position[0] - pose.x) <= bay.width * .54);
}

export function rearClearOfBays(pose: GarageCarPose, car: CarFootprint) {
  return pose.z - bodySpan(car, pose.yaw).z > GARAGE_BAY_DOORS[0].position[2] + .26;
}

export function moveGarageCar(pose: GarageCarPose, car: CarFootprint, input: ParkingInput,
  delta: number, opening: (bay: number) => number) {
  // Cap time after a background pause, then substep steep steering commands to avoid tunnelling.
  let remaining = Math.max(0, Math.min(.10, delta));
  while (remaining > 1e-7) {
    const dt = Math.min(1 / 90, remaining);
    remaining -= dt;
    const target = input.brake ? 0 : input.throttle * (input.throttle < 0 ? 2.0 : 3.45);
    const rate = input.brake || target * pose.speed < 0 ? 7.0 : !target ? 2.4 : 2.8;
    const speed = pose.speed + Math.sign(target - pose.speed) * Math.min(Math.abs(target - pose.speed), rate * dt);
    const meters = (pose.speed + speed) * dt / 2;
    // Wheels steer to the driver’s right, screen-right in a +Z-facing chase shot.
    const turn = -meters * Math.tan(input.steer * .56) / (car.length * .58);
    const x = pose.x + Math.sin(pose.yaw + turn / 2) * meters;
    const z = pose.z + Math.cos(pose.yaw + turn / 2) * meters;
    if ((meters || turn) && !fitsGarage(x, z, pose.yaw + turn, car, opening)) {
      pose.speed = 0;
      return;
    }
    pose.speed = speed;
    pose.x = x;
    pose.z = z;
    pose.yaw += turn;
  }
}
