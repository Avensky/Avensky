import { Vector3, type PerspectiveCamera } from "three";
import type { GarageEntryShot } from "./LiveGarage";

// Both starter rigs face +Z, with their shoes at garage floor level.
export const ROSTER_HEADING = .68;
const chest = new Vector3(0, .87, 0);

export function rosterCamera(creating = false): GarageEntryShot {
  let distance = 3;
  function orbit(camera: PerspectiveCamera, yaw: number, pitch: number) {
    const heading = ROSTER_HEADING - yaw;
    const elevation = .055 + pitch;
    const radius = distance * Math.cos(elevation);
    camera.position.set(radius * Math.sin(heading), chest.y + distance * Math.sin(elevation), radius * Math.cos(heading));
    camera.lookAt(chest);
  }
  return {
    frame(camera, width, height) {
      const portrait = width < height;
      camera.fov = 46;
      const fraction = portrait ? (creating ? .42 : .58) : .74;
      distance = 1.74 / (2 * fraction * Math.tan(camera.fov * Math.PI / 360));
      const centerX = portrait ? .50 : .30;
      const centerY = portrait ? (creating ? .315 : .40) : .53;
      // Shift the lens to the free space; orbiting preserves the actor's size and framing.
      camera.setViewOffset(width, height, width * (.5 - centerX), height * (.5 - centerY), width, height);
      orbit(camera, 0, 0);
    },
    orbit,
  };
}
