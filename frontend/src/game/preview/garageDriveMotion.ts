import { MathUtils } from "three";
import type { DriveStage } from "./garageDriveStore";

export const DRIVE_OUT_DURATION = 6.7;
export const GARAGE_ENTRY_START_SECONDS = 1.25;
export const GARAGE_ENTRY_DURATION = 4.14;

export function sampleDriveOut(seconds: number) {
  const ease = (start: number, end: number) => MathUtils.smoothstep(seconds, start, end);
  const stage: DriveStage = seconds < GARAGE_ENTRY_START_SECONDS ? "opening" : seconds < 3.05 ? "entering"
    : seconds < GARAGE_ENTRY_DURATION ? "closing" : seconds < DRIVE_OUT_DURATION ? "driving" : "finished";
  // Establish the exterior grip before swinging the door, then release before entry.
  const closeDoor = ease(3.08, 3.86);
  return {
    stage,
    door: ease(.48, 1.16) - closeDoor,
    handlesDoor: ease(.13, .47) * (1 - ease(.78, 1.14)),
    faceDoor: ease(.02, .47),
    closeDoor,
    enter: MathUtils.clamp((seconds - GARAGE_ENTRY_START_SECONDS) / 1.8, 0, 1),
    travel: 3.9 * ease(GARAGE_ENTRY_DURATION, DRIVE_OUT_DURATION),
    brake: ease(6, 6.6),
  };
}

export type DriveOutPose = ReturnType<typeof sampleDriveOut> & { insidePull?: number };

export const BRZ_ENTRY_SECONDS = 4.85;
export const BRZ_EXIT_SECONDS = 3.75;

export function sampleBrzEntry(seconds: number): DriveOutPose {
  const base = sampleDriveOut(seconds);
  const ease = (start: number, end: number) => MathUtils.smoothstep(seconds, start, end);
  const closeDoor = ease(3.64, 4.55);
  return { ...base, door: ease(.48, 1.16) - closeDoor, closeDoor,
    insidePull: ease(3.05, 3.62) * (1 - ease(4.48, 4.80)), travel: 0, brake: 0,
    stage: seconds >= 3.05 ? "closing" : base.stage };
}

export function sampleBrzExit(seconds: number) {
  const ease = (start: number, end: number) => MathUtils.smoothstep(seconds, start, end);
  return {
    // Release the latch and push the door before the near foot crosses the sill.
    release: ease(.39, .57) * (1 - ease(.77, 1.02)),
    door: .29 * ease(.59, .99) + .71 * ease(.96, 1.48),
    insideGrip: ease(.06, .39) * (1 - ease(.77, 1.04)),
    enter: 1 - MathUtils.clamp((seconds - 1.54) / 1.94, 0, 1),
  };
}

export type BrzExitPose = ReturnType<typeof sampleBrzExit>;
