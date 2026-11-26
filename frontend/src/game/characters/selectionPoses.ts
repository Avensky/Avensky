import type { Emote } from "./garageEmotes";

export type CharacterPose = { id: string; name: string; author?: string; pose: Emote["keys"][number][1] };

export const HANDS_BEHIND_BACK = {
  leftHand: [.31, -.75, -.51], rightHand: [-.31, -.73, -.55], elbowsBack: true,
} as const;

// Wrist targets use shoulder span and arm reach. The pocket stance also works on
// clothing without pockets, with the fingers resting along the front hip seams.
export const SELECTION_POSES = [
  { id: "pose-pocket-stance", name: "Hands near pockets", pose: {
    sway: .018, rise: -.014, torso: [.012, -.035, .018], head: [-.018, .06, -.02],
    leftHand: [1.24, -.73, .41], rightHand: [-1.26, -.76, .42],
    leftPalm: [[-.16, -1, .22], [-.56, -.06, -.84]], rightPalm: [[.16, -1, .22], [.56, -.06, -.84]],
    elbows: { l: [.36, -1, -.71], r: [-.36, -1, -.71] },
  } },
  { id: "pose-hand-on-hip", name: "One hand on hip", pose: {
    sway: -.024, rise: -.022, torso: [.01, .065, -.04], head: [-.02, -.095, .035],
    leftHand: [1.30, -.55, .23], right: [[-.21, -1, -.07], [-.13, -.95, .28]],
    leftPalm: [[-.10, -1, .28], [-1, .12, -.15]], rightPalm: [[-.06, -1, .12], [1, 0, -.12]],
    elbows: { l: [1, -.55, -.48] },
    skirtClearanceWithPalm: true, feet: { l: [.025, 0, .04, .10] },
  } },
  { id: "pose-crossed-ankles", name: "Hands behind, ankles crossed", pose: {
    ...HANDS_BEHIND_BACK, stance: -.22, sway: .03, rise: -.042, torso: [.032, -.035, .025], head: [-.035, .08, -.045],
    feet: { l: [.025, 0, -.04, .05], r: [.025, .004, .10, -.17] },
  } },
] as const satisfies readonly CharacterPose[];

export type SelectionPoseId = typeof SELECTION_POSES[number]["id"];

export function holdCharacterPose({ id, name, pose }: CharacterPose): Emote {
  return { id, name, duration: .7, keys: [[0, pose], [1, pose]] };
}
