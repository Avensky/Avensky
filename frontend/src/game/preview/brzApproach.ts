import { Box3, MathUtils, Quaternion, Vector3, type Group, type Object3D } from "three";
import { driverArm } from "../characters/garageEmotes";
import type { VehiclePartHinge } from "./vehiclePartRig";
import { prepareBrzGait } from "./brzGait";

export type BrzClearance = { car: Group; hull: Box3 };

/** Liang–Barsky on the garage XZ plane. A tangent can follow a clearance edge. */
export function crossesBrzHull(start: Vector3, end: Vector3, hull: Box3) {
  let enter = 0, leave = 1;
  for (const axis of ["x", "z"] as const) {
    const velocity = end[axis] - start[axis];
    if (Math.abs(velocity) < 1e-6) {
      if (start[axis] <= hull.min[axis] || start[axis] >= hull.max[axis]) return false;
      continue;
    }
    const lower = (hull.min[axis] - start[axis]) / velocity;
    const upper = (hull.max[axis] - start[axis]) / velocity;
    enter = Math.max(enter, Math.min(lower, upper));
    leave = Math.min(leave, Math.max(lower, upper));
    if (enter >= leave - 1e-6) return false;
  }
  return enter < leave - 1e-6;
}

export function brzWalkRoute(start: Vector3, goal: Vector3, hull: Box3): Vector3[] | undefined {
  const nodes = [start, goal];
  for (const x of [hull.min.x - .105, hull.max.x + .105]) {
    for (const z of [hull.min.z - .105, hull.max.z + .105]) nodes.push(new Vector3(x, start.y, z));
  }
  const distance = nodes.map(() => Infinity), previous = nodes.map(() => -1);
  const remaining = new Set(nodes.keys());
  distance[0] = 0;
  while (remaining.size) {
    const next = [...remaining].reduce((a, b) => distance[a] <= distance[b] ? a : b);
    if (!Number.isFinite(distance[next])) return undefined;
    if (next === 1) {
      const route = [goal];
      for (let i = previous[1]; i !== -1; i = previous[i]) route.unshift(nodes[i]);
      return route;
    }
    remaining.delete(next);
    for (const other of remaining) {
      const cost = distance[next] + nodes[next].distanceTo(nodes[other]);
      if (cost < distance[other] && !crossesBrzHull(nodes[next], nodes[other], hull)) {
        distance[other] = cost;
        previous[other] = next;
      }
    }
  }
}

export function prepareBrzApproach(root: Object3D, actor: Group, { car, hull }: BrzClearance, hinge: VehiclePartHinge) {
  const left = driverArm(root, "l"), right = driverArm(root, "r");
  const parent = actor.parent, handle = hinge.handle;
  if (!left || !right || !parent || !handle) return undefined;
  const parked = actor.position.clone(), facing = actor.quaternion.clone();
  const origin = car.worldToLocal(actor.getWorldPosition(new Vector3()));
  const shoulders = [left.shoulder, right.shoulder].map(shoulder => car.worldToLocal(shoulder.getWorldPosition(new Vector3())));
  const radius = Math.max(.22, shoulders[0].distanceTo(shoulders[1]) * .5 + .09);
  const safe = hull.clone().expandByScalar(radius + .035);
  const start = origin.clone();
  const door = hinge.part === "door-left" || hinge.part === "door-right";
  const hand = car.worldToLocal(handle.getWorldPosition(new Vector3()));
  const goal = hand.clone().setY(start.y);
  const side = Math.sign(door ? hand.x : hand.z - hull.getCenter(new Vector3()).z) || 1;
  const axis = door ? "x" : "z";
  const freeEnd = door && hinge.doorSweep
    ? Math.sign(hand.z - hinge.pivot.position.z) || -1 : 0;
  goal[axis] = side < 0 ? safe.min[axis] - .02 : safe.max[axis] + .02;
  if (door) goal.z += freeEnd * .19;
  if (hinge.hoodProp) goal.x = hull.getCenter(new Vector3()).x;
  // A parked character can start in the extra clearance margin. Move directly
  // out to the nearest edge before routing around the inflated footprint.
  if (start.x > safe.min.x && start.x < safe.max.x && start.z > safe.min.z && start.z < safe.max.z) {
    const exits = [start.clone().setX(safe.min.x - .015), start.clone().setX(safe.max.x + .015),
      start.clone().setZ(safe.min.z - .015), start.clone().setZ(safe.max.z + .015)];
    start.copy(exits.reduce((a, b) => a.distanceToSquared(origin) < b.distanceToSquared(origin) ? a : b));
  }
  const path = brzWalkRoute(start, goal, safe);
  if (!path) return undefined;
  if (start.distanceToSquared(origin) > 1e-6) path.unshift(origin);
  const rounded = path.flatMap((corner, i) => {
    if (i === 0 || i === path.length - 1) return [corner];
    const before = corner.clone().lerp(path[i-1], Math.min(.46, .22 / corner.distanceTo(path[i-1])));
    const after = corner.clone().lerp(path[i+1], Math.min(.46, .22 / corner.distanceTo(path[i+1])));
    return crossesBrzHull(before, after, safe) ? [corner] : [before, after];
  });
  const segments = rounded.slice(1).map((to, i) => ({ from: rounded[i], to, distance: rounded[i].distanceTo(to) })).filter(step => step.distance > 1e-4);
  const length = segments.reduce((total, step) => total + step.distance, 0);
  const walkSeconds = length > .04 ? length / 1.18 + .48 : 0;
  const settleSeconds = .26;
  const point = new Vector3(), forward = new Vector3(), up = new Vector3(0, 1, 0), pivotRotation = new Quaternion();
  const startFacing = door ? new Vector3(-side, 0, 0) : new Vector3(0, 0, -side);
  // Align the driver's right side with a left-hand opening, mirrored for a
  // right-hand door. Stay behind the free end of the swinging panel.
  const entryFacing = door ? new Vector3(-side * .56, 0, -freeEnd * .83).normalize() : startFacing;
  const look = new Vector3(), guide = new Vector3();
  const actorYaw = new Quaternion(), carRotation = new Quaternion(), parentRotation = new Quaternion();
  const face = (position: Vector3, look: Vector3, blend: number) => {
    actor.position.copy(parent.worldToLocal(car.localToWorld(position.clone())));
    forward.subVectors(look, position).setY(0);
    actorYaw.setFromAxisAngle(up, Math.atan2(forward.x, forward.z));
    car.getWorldQuaternion(carRotation);
    parent.getWorldQuaternion(parentRotation).invert();
    actor.quaternion.slerp(parentRotation.multiply(carRotation).multiply(actorYaw), blend);
    actor.updateWorldMatrix(true, true);
  };
  function samplePath(distance: number, position: Vector3, direction: Vector3) {
    for (const step of segments) {
      if (distance >= step.distance) { distance -= step.distance; continue; }
      position.lerpVectors(step.from, step.to, distance / step.distance);
      direction.subVectors(step.to, step.from).setY(0).normalize();
      return;
    }
    position.copy(goal);
    direction.copy(startFacing);
  }
  const gait = prepareBrzGait(root, car, length, samplePath, startFacing);
  let moving = Boolean(gait);

  return {
    duration: walkSeconds + settleSeconds,
    outward(target: Vector3) {
      car.getWorldQuaternion(carRotation);
      return target.set(0, 0, 0).setComponent(door ? 0 : 2, side).applyQuaternion(carRotation);
    },
    sample(seconds: number, delta: number) {
      const blend = 1 - Math.exp(-9 * delta);
      if (seconds < walkSeconds) {
        const distance = length * MathUtils.smootherstep(seconds, 0, walkSeconds);
        samplePath(distance, point, guide);
        samplePath(Math.min(length, distance + .28), look, forward);
        if (look.distanceToSquared(point) < .0001) look.copy(point).add(guide);
        face(point, look, blend);
        gait?.sample(distance);
        return;
      }
      if (moving) { gait?.stop(); moving = false; }
      point.copy(goal);
      // Leave room outside the actual swing of the glass, mirror and shell.
      if (door && hinge.doorSweep) {
        const plane = hinge.doorSweep;
        hinge.pivot.getWorldQuaternion(pivotRotation);
        car.getWorldQuaternion(carRotation).invert();
        pivotRotation.premultiply(carRotation);
        const wing = [plane.min.x, plane.max.x].flatMap(x => [plane.min.z, plane.max.z].map(z =>
          new Vector3(x, 0, z).applyQuaternion(pivotRotation).add(hinge.pivot.position)));
        const limit = Math.max(...wing.map(corner => corner.x * side)) + radius + .04;
        const rear = Math.max(...wing.map(corner => corner.z * freeEnd)) + radius + .05;
        const inside = MathUtils.smoothstep(goal.z * freeEnd - rear, 0, .16);
        point.x = MathUtils.lerp(side * Math.max(goal.x * side, limit), goal.x, inside);
      }
      const contact = car.worldToLocal(handle.getWorldPosition(new Vector3()));
      if (door) {
        guide.subVectors(contact, point).setY(0).normalize().lerp(entryFacing, MathUtils.smoothstep(seconds - walkSeconds - settleSeconds, .99, 1.72));
      } else guide.copy(startFacing);
      face(point, look.copy(point).add(guide), blend);
    },
    stop() { gait?.stop(); actor.position.copy(parked); actor.quaternion.copy(facing); actor.updateWorldMatrix(true, true); },
  };
}
