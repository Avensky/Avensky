import type { Emote } from "./garageEmotes";
import { CHARACTER_POSE_GROUPS } from "./posePack";

export const CREATED_EMOTE_ID = "created-emote";
export const CREATOR_MAX_FRAMES = 12;
export const CREATOR_KEY = "avensky-created-emotes-v1";
export const CREATOR_HANDS = ["Pose default", "Open", "Fist"] as const;
export const CREATOR_EASE = ["Quick", "Gentle"] as const;
export const CREATOR_FACING = ["Front", "Left", "Right"] as const;

export type EmoteFrame = {
  pose: string;
  hold: number;
  hands: typeof CREATOR_HANDS[number];
  ease: typeof CREATOR_EASE[number];
  facing: typeof CREATOR_FACING[number];
};
export type CreatedEmote = { id: string; name: string; frames: EmoteFrame[] };

const poses = new Map(CHARACTER_POSE_GROUPS.flatMap(group => group.poses.map(pose => [pose.id, pose] as const)));
export const defaultEmoteFrame = (pose = "pose-neutral"): EmoteFrame =>
  ({ pose, hold: .35, hands: "Pose default", ease: "Gentle", facing: "Front" });
const transition = (frame: EmoteFrame) => frame.ease === "Quick" ? .18 : .42;

export function creatorTimeline(frames: readonly EmoteFrame[]) {
  let time = transition(frames[0]);
  const markers = frames.map((frame, index) => {
    const start = time;
    time += frame.hold + transition(frames[index + 1] ?? frame);
    return start;
  });
  return { markers, duration: time };
}

export function createdEmoteClip(emote: CreatedEmote): Emote {
  const { markers, duration } = creatorTimeline(emote.frames);
  const keys: Emote["keys"] = [
    [0, {}],
    ...emote.frames.flatMap((frame, index) => {
      const pose = poses.get(frame.pose)?.pose ?? {};
      const facing = frame.facing === "Front" ? 0 : (frame.facing === "Left" ? 1 : -1) * Math.PI / 4;
      const fingers = frame.hands === "Pose default" ? pose.fingers
        : ([frame.hands === "Open" ? "open" : "fist", frame.hands === "Open" ? "open" : "fist"] as const);
      const composed = { ...pose, turn: facing + (pose.turn ?? 0), fingers };
      const start = markers[index];
      return [[start / duration, composed], [(start + frame.hold) / duration, composed]] as const;
    }),
    [1, {}],
  ];
  return { id: CREATED_EMOTE_ID, name: emote.name, keys, duration };
}

function validEmote(value: unknown): value is CreatedEmote {
  if (!value || typeof value !== "object") return false;
  const emote = value as Partial<CreatedEmote>;
  return typeof emote.id === "string" && /^[a-f\d-]{36}$/i.test(emote.id)
    && typeof emote.name === "string" && emote.name.trim().length > 0 && emote.name.length <= 48
    && Array.isArray(emote.frames) && emote.frames.length >= 1 && emote.frames.length <= CREATOR_MAX_FRAMES
    && emote.frames.every(frame => frame && poses.has(frame.pose) && Number.isFinite(frame.hold)
      && frame.hold >= .1 && frame.hold <= 5 && CREATOR_HANDS.includes(frame.hands)
      && CREATOR_EASE.includes(frame.ease) && CREATOR_FACING.includes(frame.facing));
}

export function readCreatedEmotes(owner: string) {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(CREATOR_KEY + ":" + owner) ?? "[]");
    return Array.isArray(stored) ? stored.filter(validEmote).slice(0, 30) : [];
  } catch { return []; }
}

export function writeCreatedEmotes(owner: string, emotes: CreatedEmote[]) {
  if (emotes.length > 30 || !emotes.every(validEmote)) throw new Error("Check the emote name and pose timing before saving.");
  localStorage.setItem(CREATOR_KEY + ":" + owner, JSON.stringify(emotes));
}
