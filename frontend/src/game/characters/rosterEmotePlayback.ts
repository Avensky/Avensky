import { LoopOnce, MathUtils, type AnimationAction, type AnimationClip, type AnimationMixer } from "three";
import type { Emote } from "./garageEmotes";

export const EMOTE_FADE_SECONDS = .52;

/** One mixer on the displayed rig. Interruptions start with the weights already on screen. */
export class RosterEmotePlayback {
  private readonly actions = new Map<string, AnimationAction>();
  private readonly outgoing = new Map<AnimationAction, number>();
  private requested?: Emote;
  private elapsed = 0;
  private startWeight = 0;
  active: AnimationAction | null = null;

  private readonly mixer: AnimationMixer;
  private readonly idle: AnimationAction;
  private readonly compile: (emote: Emote) => AnimationClip;

  constructor(mixer: AnimationMixer, idle: AnimationAction, compile: (emote: Emote) => AnimationClip) {
    this.mixer = mixer;
    this.idle = idle;
    this.compile = compile;
  }

  get blending() { return this.elapsed < EMOTE_FADE_SECONDS; }

  select(emote: Emote) {
    if (this.requested === emote) return;
    this.requested = emote;
    if (this.active) this.outgoing.set(this.active, this.active.getEffectiveWeight());
    for (const action of this.outgoing.keys()) {
      const weight = action.getEffectiveWeight();
      if (weight > 0) this.outgoing.set(action, weight);
      else { action.stop(); this.outgoing.delete(action); }
    }

    let next = this.actions.get(emote.id);
    if (!next) {
      // The IK compiler reads rest bones. Unweight briefly between draws so it
      // cannot bake the outgoing gesture into the new one. Retain clip times.
      const idleWeight = this.idle.getEffectiveWeight();
      this.idle.setEffectiveWeight(0);
      for (const action of this.outgoing.keys()) action.setEffectiveWeight(0);
      this.mixer.update(0);
      const clip = this.compile(emote);
      next = this.mixer.clipAction(clip).setLoop(LoopOnce, 1);
      next.clampWhenFinished = true;
      this.actions.set(emote.id, next);
      this.idle.setEffectiveWeight(idleWeight);
      for (const [action, weight] of this.outgoing) action.setEffectiveWeight(weight);
    }
    this.startWeight = this.outgoing.get(next) ?? 0;
    // Returning to a still-visible gesture keeps its exact position and weight.
    if (!this.outgoing.delete(next)) next.reset().setEffectiveWeight(0).play();
    this.elapsed = 0;
    this.active = next;
  }

  /** Returns true once when the chosen gesture has settled back to rest. */
  update(step: number) {
    const active = this.active;
    if (!active) return false;
    // Even a stalled GPU must present intermediate poses. Advance both sides
    // of a handoff by at most one fifth of its duration per rendered frame.
    // Once it settles, the clip uses real elapsed time again.
    if (this.outgoing.size) step = Math.min(step, EMOTE_FADE_SECONDS / 5);
    this.elapsed += step;
    const blend = MathUtils.smoothstep(this.elapsed, 0, EMOTE_FADE_SECONDS);
    let outgoingWeight = 0;
    for (const [action, start] of this.outgoing) {
      if (blend === 1) { action.stop(); this.outgoing.delete(action); }
      else {
        const weight = start * (1 - blend);
        action.setEffectiveWeight(weight);
        outgoingWeight += weight;
      }
    }
    const remaining = active.getClip().duration - active.time - step;
    const weight = Math.min(this.startWeight + (1 - this.startWeight) * blend,
      MathUtils.smoothstep(remaining, 0, EMOTE_FADE_SECONDS));
    active.setEffectiveWeight(weight);
    this.idle.setEffectiveWeight(Math.max(0, 1 - outgoingWeight - weight));
    this.mixer.update(step);
    if (remaining > 0 || this.outgoing.size) return false;
    active.stop();
    this.active = null;
    return true;
  }
}
