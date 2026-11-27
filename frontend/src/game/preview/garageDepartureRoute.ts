import { GARAGE_BAY_DOORS } from "./garageDoorLayout.ts";
import { fitsGarage, rearClearOfBays, type CarFootprint, type GarageCarPose } from "./garageParkingPhysics.ts";
import type { GarageParkingObstacle } from "./garageServiceLayout.ts";

type Arc = { direction: number; curvature: number };
type Node = GarageCarPose & Arc & { parent?: Node; cost: number; estimate: number };
const arcLength = .88;
const open = () => 1;

function advance(p: GarageCarPose, distance: number, curvature: number) {
  const yaw = p.yaw + curvature * distance;
  return { x: p.x + (curvature ? (Math.cos(p.yaw) - Math.cos(yaw)) / curvature : Math.sin(yaw) * distance),
    z: p.z + (curvature ? (Math.sin(yaw) - Math.sin(p.yaw)) / curvature : Math.cos(yaw) * distance), yaw, speed: 0 };
}

function distanceToExit(p: GarageCarPose, car: CarFootprint) {
  const dz = Math.max(0, GARAGE_BAY_DOORS[0].position[2] + car.length / 2 + .48 - p.z);
  const dx = Math.min(...GARAGE_BAY_DOORS.map(bay => Math.abs(p.x - bay.position[0])));
  return Math.hypot(dx, dz) + dx * .4 + (1 - Math.cos(p.yaw)) * car.length;
}

// Expand steering arcs a handful at a time during boarding. The common straight
// stall reaches the apron in a dozen expansions. A parked car can back and turn.
export function* garageDepartureRoute(start: GarageCarPose, car: CarFootprint, obstacles: readonly GarageParkingObstacle[]) {
  const pending: Node[] = [{ ...start, direction: 1, curvature: 0, cost: 0, estimate: 0 }];
  // Probe a slightly wider car when there is room. This keeps curved paths away
  // from jambs even between check points, while allowing a tightly parked start.
  const margin = { ...car, width: car.width + .14, length: car.length + .14 };
  const visited = new Set<number>();
  const maxTurn = Math.tan(.56) / (car.length * .58);
  while (pending.length && visited.size < 6000) {
    const current = pending.pop()!;
    const heading = ((Math.round(current.yaw / (Math.PI / 18)) % 36) + 36) % 36;
    const key = ((Math.round((current.z + 8) / .40) * 50 + Math.round((current.x + 8) / .40)) * 36 + heading) * 2 + Number(current.direction > 0);
    if (visited.has(key)) continue;
    visited.add(key);
    if (rearClearOfBays(current, car)) {
      const arcs: Arc[] = [];
      for (let n: Node | undefined = current; n?.parent; n = n.parent) arcs.push({ direction: n.direction, curvature: n.curvature });
      return arcs.reverse();
    }
    const clearance = fitsGarage(current.x, current.z, current.yaw, margin, open, obstacles) ? margin : car;
    for (const direction of [1, -1]) for (const steering of [0, -1, 1, -.5, .5]) {
      const curvature = maxTurn * steering;
      let p: GarageCarPose | undefined;
      for (let step = 1; step <= 10; step++) {
        p = advance(current, direction * arcLength * step / 10, curvature);
        if (!fitsGarage(p.x, p.z, p.yaw, clearance, open, obstacles)) { p = undefined; break; }
      }
      if (!p) continue;
      const cost = current.cost + arcLength * (direction < 0 ? 1.42 : 1) + Math.abs(steering) * .13 +
        (current.direction !== direction ? 1.35 : 0);
      const estimate = cost + distanceToExit(p, car) * 1.8;
      // Descending queue so taking the lowest estimated cost is constant time.
      let low = 0, high = pending.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (pending[middle].estimate > estimate) low = middle + 1; else high = middle;
      }
      pending.splice(low, 0, { ...p, direction, curvature, parent: current, cost, estimate });
    }
    yield;
  }
  return null;
}

export class GarageDepartureDrive {
  private path?: Arc[] | null;
  private index = 0;
  private along = 0;
  private speed = 0;
  private readonly planner: ReturnType<typeof garageDepartureRoute>;
  private readonly car: CarFootprint;
  private readonly obstacles: readonly GarageParkingObstacle[];
  constructor(pose: GarageCarPose, car: CarFootprint, obstacles: readonly GarageParkingObstacle[]) {
    this.car = car;
    this.obstacles = obstacles;
    this.planner = garageDepartureRoute({ ...pose }, car, obstacles);
  }
  get planning() { return this.path === undefined; }
  prepare() {
    const until = performance.now() + 2;
    while (this.path === undefined && performance.now() < until) {
      const step = this.planner.next();
      if (step.done) this.path = step.value;
    }
    return this.path !== null;
  }
  step(pose: GarageCarPose, elapsed: number, opening: (bay: number) => number, reducedMotion: boolean) {
    if (!this.path) return;
    const dt = Math.min(elapsed, .10);
    const arc = this.path[this.index];
    if (!arc) return;
    const speedLimit = reducedMotion ? 4 : arc.direction < 0 ? 1.45 : 2.8;
    this.speed = Math.min(speedLimit, this.speed + dt * 2.4);
    let travel = this.speed * dt;
    while (travel > 1e-6 && this.index < this.path.length) {
      const next = this.path[this.index];
      const distance = Math.min(travel, arcLength - this.along, .09);
      const p = advance(pose, distance * next.direction, next.curvature);
      if (!fitsGarage(p.x, p.z, p.yaw, this.car, opening, this.obstacles)) {
        this.speed = pose.speed = 0;
        return fitsGarage(p.x, p.z, p.yaw, this.car, open, this.obstacles) ? "waiting-for-shutter" : "blocked";
      }
      Object.assign(pose, p, { speed: this.speed * next.direction });
      travel -= distance;
      this.along += distance;
      if (this.along >= arcLength - 1e-7) {
        this.along = 0; this.index++;
        if (this.path[this.index]?.direction !== next.direction) { this.speed = pose.speed = 0; break; }
      }
    }
  }
}
