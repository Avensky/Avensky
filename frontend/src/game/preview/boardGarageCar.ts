import { AnimationMixer, Box3, Group, MathUtils, Object3D, Vector3 } from "three";
import { buildEmoteClips, garageBreathing } from "../characters/garageEmotes";
import { usePersonalGarage } from "../../store/social/personalGarage";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
import { prepareBrzGait } from "./brzGait";
import { boardingCar, boardingDoor, parkedDriverStation } from "./garageBoarding";
import { prepareGarageCockpit, type CockpitPlayback } from "./garageCockpit";
import { BRZ_ENTRY_SECONDS, sampleBrzEntry } from "./garageDriveMotion";
import { garageParkingPose } from "./garageParkingCamera";
import { brzWalkRoute } from "./brzApproach";
import type { GarageCarFootprint } from "./GarageParkedVehicle";
import { garageParkingObstacles, type GarageParkingObstacle } from "./garageServiceLayout";
import type { VehiclePartHinge } from "./vehiclePartRig";

export function prepareBoardingPath(origin: Vector3, car: Group, dimensions: GarageCarFootprint,
  seat: readonly number[], obstacles: readonly GarageParkingObstacle[]) {
  const side = Math.sign(seat[0]), halfWidth = dimensions.width / 2, halfLength = dimensions.length / 2;
  const start = car.worldToLocal(origin.clone()).setY(0);
  const goal = new Vector3(side * (halfWidth + .29), 0, seat[2] - .27);
  const hull = new Box3(new Vector3(-halfWidth - .17, 0, -halfLength - .19), new Vector3(halfWidth + .17, 2, halfLength + .19));
  // Transform the few nearby workshop footprints once into the car's frame. Allow a tight
  // stance next to a rack at a right-hand-drive door, where broad rectangles may overlap.
  const limits = obstacles.map(o => {
    const sin = Math.sin(o.yaw), cos = Math.cos(o.yaw);
    const corners = [-1, 1].flatMap(i => [-1, 1].map(j => {
      const x = i * o.halfWidth, z = j * o.halfLength;
      return car.worldToLocal(new Vector3(o.x + x * cos + z * sin, 0, o.z - x * sin + z * cos));
    }));
    const solid = new Box3().setFromPoints(corners);
    const padded = solid.clone().expandByScalar(.10);
    return padded.containsPoint(start) || padded.containsPoint(goal) ? solid : padded;
  });
  const points = brzWalkRoute(start, goal, hull, ...limits);
  if (!points) throw Error("The path to the driver door is blocked. Repark your car or move the nearby furniture and try again.");
  const legs = points.slice(1).map((end, i) => {
    const from = points[i], heading = end.clone().sub(from);
    return { from, end, distance: heading.length(), heading: heading.normalize() };
  });
  const length = legs.reduce((sum, leg) => sum + leg.distance, 0);
  const facing = new Vector3(-side * .56, 0, .83).normalize();
  return { length, facing, sample(distance: number, point: Vector3, heading: Vector3) {
    for (const leg of legs) {
      if (distance < leg.distance) {
        point.copy(leg.from).addScaledVector(leg.heading, distance);
        heading.copy(leg.heading);
        return;
      }
      distance -= leg.distance;
    }
    point.copy(goal);
    heading.copy(facing);
  } };
}

/** Animate the roster rig that is already on screen. Only the parked car's floor
 * transform moves during the rollout; the seated skeleton needs no per-frame IK. */
export function boardGarageCar(actor: Group, driver: Object3D, model: VehicleModelId) {
  const home = actor.position.clone(), rotation = actor.quaternion.clone();
  const shadow = actor.getObjectByName("preview-contact-shadow");
  const car = new Group(), motion = new Group();
  const frameCar = () => {
    car.position.set(garageParkingPose.x, 0, garageParkingPose.z);
    car.rotation.y = garageParkingPose.yaw;
    car.updateMatrixWorld(true);
  };
  frameCar();
  const station = parkedDriverStation(model, boardingCar);
  const side = Math.sign(station.seat[0]);
  const path = prepareBoardingPath(actor.getWorldPosition(new Vector3()), car, boardingCar, station.seat,
    garageParkingObstacles(usePersonalGarage.getState().layout));
  const walkTime = path.length / 1.48;
  const point = new Vector3(), heading = new Vector3(), finalFacing = path.facing;
  const rest = new AnimationMixer(driver);
  const [idle] = buildEmoteClips(driver, [garageBreathing()]);
  rest.clipAction(idle).play();
  rest.update(0);
  const gait = prepareBrzGait(driver, car, path.length, path.sample, finalFacing);
  const hinge = new Group(), handle = new Object3D(), pull = new Object3D();
  const gullwing = model === "timecar";
  hinge.position.set(side * boardingCar.width * (gullwing ? .20 : .445), boardingCar.height * (gullwing ? .94 : .46),
    station.seat[2] + .77);
  handle.position.set(side * boardingCar.width * .49, boardingCar.height * .55, station.seat[2] - .36).sub(hinge.position);
  pull.position.copy(handle.position); pull.position.x -= side * .09;
  hinge.add(handle, pull);
  car.add(hinge);
  const door: VehiclePartHinge = { part: side > 0 ? "door-left" : "door-right", axis: gullwing ? "z" : "y",
    pivot: hinge, closed: 0, angle: 0, open: side * (gullwing ? 1 : -1.01), handle, interiorPull: pull };
  let cockpit: CockpitPlayback | null = null, seated = false;
  const attached = new Vector3();
  let attachedYaw = 0;
  const rotationYaw = actor.rotation.y;
  const walk = (seconds: number) => {
    const distance = Math.min(path.length, seconds * 1.48);
    path.sample(distance, point, heading);
    actor.position.copy(car.localToWorld(point));
    actor.parent?.worldToLocal(actor.position);
    const turn = MathUtils.smoothstep(distance, 0, .24);
    const arrive = MathUtils.smoothstep(distance, Math.max(0, path.length - .28), path.length);
    heading.lerp(finalFacing, arrive).normalize();
    const targetYaw = car.rotation.y + Math.atan2(heading.x, heading.z);
    actor.rotation.y = rotationYaw + turn * Math.atan2(Math.sin(targetYaw - rotationYaw), Math.cos(targetYaw - rotationYaw));
    actor.updateWorldMatrix(true, true);
    gait?.sample(distance);
  };
  return {
    sample(seconds: number) {
      if (!seated && seconds < walkTime) { walk(seconds); return false; }
      if (!seated && !cockpit) {
        walk(walkTime);
        gait?.stop();
        car.updateWorldMatrix(true, true);
        cockpit = prepareGarageCockpit(car, [], door, station)(driver, motion);
        attached.copy(car.worldToLocal(actor.getWorldPosition(new Vector3())));
        attachedYaw = actor.rotation.y - car.rotation.y;
      }
      if (!seated) {
        const entry = sampleBrzEntry(seconds - walkTime);
        boardingDoor.opening = entry.door;
        cockpit?.sample(null, 0, entry);
        if (shadow) shadow.visible = entry.enter < .45;
        seated = seconds - walkTime >= BRZ_ENTRY_SECONDS;
        if (!seated) return false;
      }
      frameCar();
      actor.position.copy(attached);
      car.localToWorld(actor.position);
      actor.parent?.worldToLocal(actor.position);
      actor.rotation.y = car.rotation.y + attachedYaw;
      return true;
    },
    dispose() {
      gait?.stop(); cockpit?.stop(); rest.stopAllAction(); rest.uncacheRoot(driver);
      actor.position.copy(home); actor.quaternion.copy(rotation);
      if (shadow) shadow.visible = true;
      boardingDoor.opening = 0;
    },
  };
}
