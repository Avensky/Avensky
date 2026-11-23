import { Box3, Quaternion, Ray, Vector3 } from "three";
import type { PhysicsEntitySnapshot } from "../../store/session/networkStore";

const sidePoint = new Vector3(), rotation = new Quaternion(), center = new Vector3();
const inverse = new Quaternion(), localRay = new Ray(), box = new Box3(), hit = new Vector3();
const half = new Vector3(), size = new Vector3();

export function canReachHubCar(feet: readonly number[], car: PhysicsEntitySnapshot) {
  rotation.fromArray(car.rotation);
  center.fromArray(car.position);
  const width = (car.collider?.chassis_half_extents[0] ?? .88) + .12;
  return [-1, 1].some(side => {
    sidePoint.set(side * width, 0, -.18).applyQuaternion(rotation).add(center);
    return Math.hypot(sidePoint.x - feet[0], sidePoint.z - feet[2]) < 1.65 && Math.abs(sidePoint.y - feet[1]) < 1.25;
  });
}

export function pickHubCar(ray: Ray, cars: readonly PhysicsEntitySnapshot[], maxDistance = 16) {
  let closest: PhysicsEntitySnapshot | undefined, best = maxDistance;
  for (const car of cars) {
    if (!car.vehicle_id) continue;
    center.fromArray(car.position);
    inverse.fromArray(car.rotation).invert();
    localRay.origin.copy(ray.origin).sub(center).applyQuaternion(inverse);
    localRay.direction.copy(ray.direction).applyQuaternion(inverse);
    half.fromArray(car.collider?.chassis_half_extents ?? [.9, .55, 2.1]).addScalar(.18);
    size.fromArray(car.collider?.chassis_offset ?? [0, .31, 0]);
    box.min.copy(size).sub(half);
    box.max.copy(size).add(half);
    if (!localRay.intersectBox(box, hit)) continue;
    const distance = hit.distanceTo(localRay.origin);
    if (distance >= best) continue;
    best = distance;
    closest = car;
  }
  return closest && { car: closest, distance: best };
}
