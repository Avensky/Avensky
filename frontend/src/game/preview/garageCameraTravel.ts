import { Euler, MathUtils, Quaternion, Vector3, type Box3, type PerspectiveCamera } from "three";
import type { GarageEntryShot } from "./LiveGarage";
import { clampGarageElevation } from "./garageOrbitAngles.ts";

export function garageOrbitDirection(direction: Vector3, heading: number, elevation: number) {
  elevation = clampGarageElevation(elevation);
  const horizontal = Math.cos(elevation);
  return direction.set(horizontal * Math.sin(heading), Math.sin(elevation), horizontal * Math.cos(heading));
}

const roomAxes = ["x", "y", "z"] as const;

/** Shorten the sightline only where the garage shell intersects the orbit. */
export function garageOrbitDistance(target: Vector3, direction: Vector3, distance: number, bounds?: Box3) {
  if (!bounds) return distance;
  for (const axis of roomAxes) {
    const component = direction[axis];
    if (Math.abs(component) < 1e-8) continue;
    const wall = component > 0 ? bounds.max[axis] : bounds.min[axis];
    distance = Math.min(distance, (wall - target[axis]) / component);
  }
  return Math.max(.05, distance);
}

export function placeGarageOrbit(camera: PerspectiveCamera, target: Vector3, distance: number, heading: number, elevation: number, bounds?: Box3) {
  const ray = garageOrbitDirection(camera.position, heading, elevation);
  ray.multiplyScalar(garageOrbitDistance(target, ray, distance, bounds)).add(target);
  camera.lookAt(target);
}

const TRAVEL_MS = 1000;
const worldUp = new Vector3(0, 1, 0);
const WORKBENCH_CLEARANCE_Y = 2.2;

class Lens {
  fov = 55;
  x = 0;
  y = 0;

  read(camera: PerspectiveCamera) {
    this.fov = camera.fov;
    const view = camera.view;
    this.x = view?.enabled ? view.offsetX / view.fullWidth : 0;
    this.y = view?.enabled ? view.offsetY / view.fullHeight : 0;
  }
}

function applyLens(camera: PerspectiveCamera, width: number, height: number, fov: number, x: number, y: number) {
  const changed = camera.fov !== fov || camera.aspect !== width / height;
  camera.fov = fov;
  camera.aspect = width / height;
  const view = camera.view;
  if (x || y) {
    if (changed || !view?.enabled || view.fullWidth !== width || view.fullHeight !== height ||
        view.offsetX !== x * width || view.offsetY !== y * height) {
      camera.setViewOffset(width, height, x * width, y * height, width, height);
    }
  } else if (view?.enabled) camera.clearViewOffset();
  else if (changed) camera.updateProjectionMatrix();
}

export type GarageShotPhase = "waiting" | "framing" | "framed";

/** Sample the camera that is actually being drawn, including the player's orbit and lens shift. */
export class GarageCameraTravel {
  private shot?: GarageEntryShot;
  private framingRevision = 0;
  private width = 0;
  private height = 0;
  private dpr = 0;
  private sourcePosition = new Vector3();
  private sourceOrientation = new Quaternion();
  private localStart = new Quaternion();
  private localEnd = new Quaternion();
  private yawRotation = new Quaternion();
  private sourceRadius = 0;
  private sourceHeading = 0;
  private arcDirection = 0;
  private sourceLens = new Lens();
  private targetLens = new Lens();
  private roomPosition = new Vector3();
  private roomOrientation = new Euler(0, 0, 0, "YXZ");
  private roomLook = new Euler(0, 0, 0, "YXZ");
  private time = TRAVEL_MS;
  private lastFrame?: number;
  settledAngleSquared = 1e-10;
  moving = false;
  phase?: GarageShotPhase;

  resume() { this.lastFrame = undefined; }

  frame(camera: PerspectiveCamera, requested: GarageEntryShot | undefined, width: number, height: number, dpr: number,
        yaw: number, pitch: number, now: number, reducedMotion: boolean, bounds?: Box3) {
    if (width <= 0 || height <= 0) return; // The persistent canvas may briefly move between DOM parents.
    const firstFrame = this.width === 0;
    if (firstFrame) camera.userData.hasGarageFrame = true;
    // Returning to the same station still needs a fresh trip from the inspector's last frame.
    const returned = camera.userData.returnedFromWorkshop === true;
    if (returned) delete camera.userData.returnedFromWorkshop;
    const waiting = requested?.subject === "loading";
    const missing = requested?.subject === "unavailable";
    const shot = waiting || (firstFrame && !reducedMotion) ? this.shot : missing ? undefined : requested;
    const resized = width !== this.width || height !== this.height;
    // A late head/waist measurement is a new destination even for the same
    // shot. Start that adjustment from the lens currently on screen.
    const revision = shot?.framingRevision ?? 0;
    const changed = returned || this.shot !== shot || this.framingRevision !== revision;
    if (changed || resized || this.dpr !== dpr) {
      if (changed || resized && this.time < TRAVEL_MS) {
        this.sourcePosition.copy(camera.position);
        this.sourceOrientation.copy(camera.quaternion);
        this.sourceLens.read(camera);
        this.time = firstFrame || reducedMotion ? TRAVEL_MS : 0;
        this.lastFrame = now;
      }
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.shot = shot;
      this.framingRevision = revision;
      if (shot) shot.frame(camera, width, height);
      else {
        const portrait = width < height;
        this.roomPosition.set(portrait ? 4.6 : 5.55, portrait ? 1.72 : 1.57, 4.95);
        camera.position.copy(this.roomPosition);
        camera.lookAt(portrait ? -3.1 : -4.7, portrait ? 2.22 : 1.95, -5.55);
        this.roomOrientation.setFromQuaternion(camera.quaternion);
        applyLens(camera, width, height, portrait ? 70 : 59, 0, 0);
      }
      this.targetLens.read(camera);
      // Stop orbit damping once even a corner would move less than a quarter of one drawn pixel.
      const projection = camera.projectionMatrix.elements;
      const focalPixels = .5 * Math.max(1, height * dpr) * projection[5];
      const cornerScale = 1 + (1 / projection[0]) ** 2 + (1 / projection[5]) ** 2;
      this.settledAngleSquared = (.25 / (focalPixels * cornerScale)) ** 2;
    }

    if (shot) shot.orbit(camera, yaw, pitch, bounds);
    else {
      camera.position.copy(this.roomPosition);
      this.roomLook.set(clampGarageElevation(this.roomOrientation.x + pitch), this.roomOrientation.y + yaw, 0);
      camera.quaternion.setFromEuler(this.roomLook);
    }

    if ((changed || resized) && this.time < TRAVEL_MS) {
      const from = this.sourcePosition, to = camera.position;
      this.sourceRadius = Math.hypot(from.x, from.z);
      this.sourceHeading = Math.atan2(from.x, from.z);
      // Only a move to the opposing side of the actor needs to go around the workbench.
      // Keep its turn direction through subsequent changes to the player's drag offset.
      this.arcDirection = from.x * to.x + from.z * to.z < 0 && this.sourceRadius > 1 &&
        to.x * to.x + to.z * to.z > 1 ? Math.sign(from.z * to.x - from.x * to.z) || 1 : 0;
      if (this.arcDirection) {
        this.yawRotation.setFromAxisAngle(worldUp, -this.sourceHeading);
        this.localStart.copy(this.sourceOrientation).premultiply(this.yawRotation);
      }
    }

    const lens = this.targetLens;
    if (reducedMotion || (changed && this.sourcePosition.distanceToSquared(camera.position) < 1e-10 &&
        1 - Math.abs(this.sourceOrientation.dot(camera.quaternion)) < 1e-10 &&
        this.sourceLens.fov === lens.fov && this.sourceLens.x === lens.x && this.sourceLens.y === lens.y)) {
      this.time = TRAVEL_MS;
    }
    if (this.time < TRAVEL_MS) {
      // A first GPU upload or a long task can span the whole move. Preserve visible intermediate frames.
      this.time = Math.min(TRAVEL_MS, this.time + Math.min(100, Math.max(0, now - (this.lastFrame ?? now))));
    }
    this.lastFrame = now;
    if (this.time < TRAVEL_MS) {
      // Keep interior arcs in the shell; the chase shot can intentionally follow the car through a bay.
      const indoorBounds = bounds?.containsPoint(this.sourcePosition) && bounds.containsPoint(camera.position) ? bounds : undefined;
      const t = MathUtils.smootherstep(this.time, 0, TRAVEL_MS);
      if (this.arcDirection && t > 0) {
        const end = camera.position;
        const endHeading = Math.atan2(end.x, end.z);
        const turn = MathUtils.euclideanModulo((endHeading - this.sourceHeading) * this.arcDirection, Math.PI * 2);
        const heading = this.sourceHeading + this.arcDirection * turn * t;
        // Blend inverse range so the long portrait shots pass inside the map-room partition.
        const radius = 1 / MathUtils.lerp(1 / this.sourceRadius, 1 / Math.hypot(end.x, end.z), t);
        const y = MathUtils.lerp(this.sourcePosition.y, end.y, t);
        const lift = Math.max(0, WORKBENCH_CLEARANCE_Y - y) * 4 * t * (1 - t);
        camera.position.set(radius * Math.sin(heading), y + lift, radius * Math.cos(heading));
        // Blend aim relative to the driver's bearing. A global shortest-path slerp can
        // turn the wrong way when the desk and the garage door are on opposite sides.
        this.localEnd.copy(camera.quaternion).premultiply(this.yawRotation.setFromAxisAngle(worldUp, -endHeading));
        camera.quaternion.slerpQuaternions(this.localStart, this.localEnd, t)
          .premultiply(this.yawRotation.setFromAxisAngle(worldUp, heading));
        camera.rotateX(-Math.atan2(lift, radius));
      } else {
        camera.position.lerpVectors(this.sourcePosition, camera.position, t);
        camera.quaternion.slerp(this.sourceOrientation, 1 - t);
      }
      indoorBounds?.clampPoint(camera.position, camera.position);
      applyLens(camera, width, height, MathUtils.lerp(this.sourceLens.fov, lens.fov, t),
        MathUtils.lerp(this.sourceLens.x, lens.x, t), MathUtils.lerp(this.sourceLens.y, lens.y, t));
    } else applyLens(camera, width, height, lens.fov, lens.x, lens.y);

    this.moving = this.time < TRAVEL_MS || Boolean(firstFrame && requested && !waiting && !missing && !reducedMotion);
    this.phase = !requested ? undefined : waiting ? "waiting" : this.moving ? "framing" : "framed";
  }
}
