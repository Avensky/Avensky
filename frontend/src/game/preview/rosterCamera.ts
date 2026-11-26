import { Vector3, type PerspectiveCamera } from "three";
import type { GarageEntryShot } from "./LiveGarage";

// Both starter rigs face +Z, with their shoes at garage floor level.
export const ROSTER_HEADING = .68;
export type CharacterGarageView = "roster" | "create" | "profile";
export type CharacterGarageShot = GarageEntryShot & { fitPortrait(eyeHeight: number, waistHeight: number): void };
const landscape = { bodyFraction: .74, aimHeight: .87, centerY: .53 };
const portraitFrames = {
  roster:  { bodyFraction: .58, aimHeight: .87, centerY: .40 },
  create:  { bodyFraction: .42, aimHeight: .87, centerY: .315 },
};
const fov = 46;
const viewSpan = 2 * Math.tan(fov * Math.PI / 360);
const portraitEyeLine = .16;
const portraitWaistLine = .52;

export function rosterCamera(view: CharacterGarageView = "roster"): CharacterGarageShot {
  const target = new Vector3(0, .87, 0);
  let distance = 3;
  let eye = 1.57, waist = 1.08, closeUp = false;
  function framePortrait() {
    target.y = eye;
    distance = (eye - waist) / ((portraitWaistLine - portraitEyeLine) * viewSpan);
  }
  function orbit(camera: PerspectiveCamera, yaw: number, pitch: number) {
    const heading = ROSTER_HEADING - yaw;
    const elevation = .055 + pitch;
    const radius = distance * Math.cos(elevation);
    camera.position.set(radius * Math.sin(heading), target.y + distance * Math.sin(elevation), radius * Math.cos(heading));
    camera.lookAt(target);
  }
  return {
    fitPortrait(eyeHeight, waistHeight) {
      if (eyeHeight <= waistHeight) return;
      eye = eyeHeight;
      waist = waistHeight;
      if (closeUp) framePortrait();
    },
    frame(camera, width, height) {
      const portrait = width < height;
      camera.fov = fov;
      closeUp = portrait && view === "profile";
      let centerY = portraitEyeLine;
      if (closeUp) framePortrait();
      else {
        const frame = portrait && view !== "profile" ? portraitFrames[view] : landscape;
        target.y = frame.aimHeight;
        centerY = frame.centerY;
        distance = 1.74 / (frame.bodyFraction * viewSpan);
      }
      const centerX = portrait ? .50 : .30;
      // Shift the lens to the free space; orbiting preserves the actor's size and framing.
      camera.setViewOffset(width, height, width * (.5 - centerX), height * (.5 - centerY), width, height);
      orbit(camera, 0, 0);
    },
    orbit,
  };
}
