import { MathUtils, Quaternion, Vector3, type PerspectiveCamera } from "three";
import type { GarageEntryShot } from "./LiveGarage";

const TRAVEL_MS = 1000;

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
  private sourceLens = new Lens();
  private targetLens = new Lens();
  private roomPosition = new Vector3();
  private roomOrientation = new Quaternion();
  private time = TRAVEL_MS;
  private lastFrame?: number;
  settledAngleSquared = 1e-10;
  moving = false;
  phase?: GarageShotPhase;

  resume() { this.lastFrame = undefined; }

  frame(camera: PerspectiveCamera, requested: GarageEntryShot | undefined, width: number, height: number, dpr: number,
        yaw: number, pitch: number, now: number, reducedMotion: boolean) {
    if (width <= 0 || height <= 0) return; // The persistent canvas may briefly move between DOM parents.
    const firstFrame = this.width === 0;
    const waiting = requested?.subject === "loading";
    const missing = requested?.subject === "unavailable";
    const shot = waiting || (firstFrame && !reducedMotion) ? this.shot : missing ? undefined : requested;
    const resized = width !== this.width || height !== this.height;
    // A late head/waist measurement is a new destination even for the same
    // shot. Start that adjustment from the lens currently on screen.
    const revision = shot?.framingRevision ?? 0;
    const changed = this.shot !== shot || this.framingRevision !== revision;
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
        this.roomOrientation.copy(camera.quaternion);
        applyLens(camera, width, height, portrait ? 70 : 59, 0, 0);
      }
      this.targetLens.read(camera);
      // Stop orbit damping once even a corner would move less than a quarter of one drawn pixel.
      const projection = camera.projectionMatrix.elements;
      const focalPixels = .5 * Math.max(1, height * dpr) * projection[5];
      const cornerScale = 1 + (1 / projection[0]) ** 2 + (1 / projection[5]) ** 2;
      this.settledAngleSquared = (.25 / (focalPixels * cornerScale)) ** 2;
    }

    if (shot) shot.orbit(camera, yaw, pitch);
    else {
      camera.position.copy(this.roomPosition);
      camera.quaternion.copy(this.roomOrientation);
      camera.rotateY(yaw);
      camera.rotateX(pitch);
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
      const t = MathUtils.smootherstep(this.time, 0, TRAVEL_MS);
      camera.position.lerpVectors(this.sourcePosition, camera.position, t);
      camera.quaternion.slerp(this.sourceOrientation, 1 - t);
      applyLens(camera, width, height, MathUtils.lerp(this.sourceLens.fov, lens.fov, t),
        MathUtils.lerp(this.sourceLens.x, lens.x, t), MathUtils.lerp(this.sourceLens.y, lens.y, t));
    } else applyLens(camera, width, height, lens.fov, lens.x, lens.y);

    this.moving = this.time < TRAVEL_MS || Boolean(firstFrame && requested && !waiting && !missing && !reducedMotion);
    this.phase = !requested ? undefined : waiting ? "waiting" : this.moving ? "framing" : "framed";
  }
}
