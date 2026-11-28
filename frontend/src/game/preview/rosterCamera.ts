import { Vector3, type Box3, type PerspectiveCamera } from "three";
import type { GarageEntryShot } from "./LiveGarage";
import { placeGarageOrbit } from "./garageCameraTravel.ts";
import { creatorFrames, PORTRAIT_FOV as fov, type CreatorFrame } from "./portraitFraming.ts";
import type { CreatorStep } from "../welcome/CharacterCreator";
export type { CreatorFrame } from "./portraitFraming.ts";

// Both starter rigs face +Z, with their shoes at garage floor level.
export const ROSTER_HEADING = .68;
export type CharacterGarageView = "roster" | "create" | "profile" | "main";
export const creatorStepFrames = {
  gender: "body", looks: "looks", skin: "face", hairstyle: "face", hair: "face",
  eyes: "eyes", makeup: "makeup", personality: "outfit",
} as const satisfies Record<CreatorStep, CreatorFrame>;
export type CharacterGarageShot = GarageEntryShot & { fitPortrait(eyeHeight: number, waistHeight: number, eyeX?: number, eyeZ?: number): void };
const landscape = { bodyFraction: .74, aimHeight: .87, centerY: .53 };
const portraitFrames = {
  roster:  { bodyFraction: .58, aimHeight: .87, centerY: .40 },
  create:  { bodyFraction: .42, aimHeight: .87, centerY: .315 },
};
const viewSpan = 2 * Math.tan(fov * Math.PI / 360);
const portraitEyeLine = .16;
const portraitWaistLine = .52;

// Place the eyes above the controls and measure zoom in eye-to-waist lengths
// so both rigs fill the frame without separate camera positions per character.
export function rosterCamera(view: Exclude<CharacterGarageView, "main"> = "roster", creatorFrame?: CreatorFrame): CharacterGarageShot {
  const target = new Vector3(0, .87, 0);
  let distance = 3;
  const closeUp = creatorFrame === "looks" || creatorFrame === "eyes" || creatorFrame === "makeup";
  let eye = 1.57, waist = 1.08, torsoSpan = 0;
  function framePortrait() {
    target.y = eye;
    distance = (eye - waist) * torsoSpan / viewSpan;
  }
  function orbit(camera: PerspectiveCamera, yaw: number, pitch: number, bounds?: Box3) {
    placeGarageOrbit(camera, target, distance, ROSTER_HEADING - yaw, .055 + pitch, bounds);
  }
  return {
    subject: "loading", framingRevision: 0,
    fitPortrait(eyeHeight, waistHeight, eyeX = 0, eyeZ = 0) {
      const x = closeUp ? eyeX : 0, z = closeUp ? eyeZ : 0;
      if (eyeHeight <= waistHeight || (eyeHeight === eye && waistHeight === waist && target.x === x && target.z === z)) return;
      target.x = x;
      target.z = z;
      this.framingRevision = (this.framingRevision ?? 0) + 1;
      eye = eyeHeight;
      waist = waistHeight;
      if (torsoSpan) framePortrait();
    },
    frame(camera, width, height) {
      const portrait = width < height;
      camera.fov = fov;
      const creator = view === "create" && creatorFrame ? creatorFrames[creatorFrame][portrait ? "tall" : "wide"] : undefined;
      let centerY = creator?.eyeLine ?? portraitEyeLine;
      torsoSpan = creator?.torsoSpan ?? (portrait && view === "profile" ? 1 / (portraitWaistLine - portraitEyeLine) : 0);
      if (torsoSpan) framePortrait();
      else {
        const frame = !portrait || view === "profile" ? landscape : portraitFrames[view];
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
