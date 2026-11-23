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

export type DriveOutPose = ReturnType<typeof sampleDriveOut>;

export const BRZ_EXIT_SECONDS = 3.65;

export function sampleBrzExit(seconds: number) {
  const ease = (start: number, end: number) => MathUtils.smoothstep(seconds, start, end);
  return {
    // Release the latch and push the door before the near foot crosses the sill.
    door: .31 * ease(.48, .94) + .69 * ease(.91, 1.38),
    insideGrip: ease(.06, .45) * (1 - ease(.71, 1.10)),
    enter: 1 - MathUtils.clamp((seconds - 1.44) / 1.94, 0, 1),
  };
}

export type BrzExitPose = ReturnType<typeof sampleBrzExit>;
