import assert from "node:assert/strict";
import test from "node:test";
import { AnimationClip, AnimationMixer, Bone, Group, NumberKeyframeTrack,
  Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from "three";
import { RosterEmotePlayback } from "../src/game/characters/rosterEmotePlayback.ts";

test("rapid personality changes crossfade the displayed bones and props, including when returning to a fading action", () => {
  const root = new Group(), head = new Bone(), prop = new Group();
  head.name = "head"; prop.name = "prop"; prop.scale.setScalar(0); root.add(head, prop);
  const mixer = new AnimationMixer(root);
  const idle = mixer.clipAction(new AnimationClip("standing", 1, [])).play();
  const gestures = [-1, .4, 1.2].map((angle, i) => ({ id: String(i), angle }));
  const built = [];
  const relativeAngle = () => head.rotation.y;
  const close = (value, target, label) => assert.ok(Math.abs(value - target) < 1e-5, label + ": " + value + " vs " + target);
  const playback = new RosterEmotePlayback(mixer, idle, gesture => {
    close(relativeAngle(), 0, "the solver sees the rest skeleton on an interrupted cache miss");
    close(prop.scale.x, 0, "the prop returns to rest while compiling");
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), gesture.angle).toArray();
    const clip = new AnimationClip(gesture.id, 3, [
      new QuaternionKeyframeTrack("head.quaternion", [0, 3], [...rotation, ...rotation]),
      new NumberKeyframeTrack(".position[x]", [0, 3], [gesture.angle, gesture.angle]),
      ...(gesture === gestures[0] ? [new VectorKeyframeTrack("prop.scale", [0, 3], [1, 1, 1, 1, 1, 1])] : []),
    ]);
    built.push(clip);
    return clip;
  });
  function select(index) { playback.select(gestures[index]); playback.update(0); }
  function interrupt(index) {
    const before = [relativeAngle(), root.position.x, prop.scale.x];
    select(index);
    [relativeAngle(), root.position.x, prop.scale.x].forEach((v, i) => close(v, before[i], "first frame matches preceding pose"));
  }
  select(0); playback.update(.6);
  close(relativeAngle(), -1, "first signature reaches its pose");
  interrupt(1); playback.update(.26);
  assert.ok(relativeAngle() > -.95 && relativeAngle() < -.02, "new gesture moves during the outgoing gesture");
  close(prop.scale.x, .5, "the old prop fades with its original hand");
  interrupt(2); playback.update(.07);
  interrupt(0); playback.update(.6);
  close(relativeAngle(), -1, "a reselected gesture resumes");
  assert.equal(built.length, 3);
  assert.equal(mixer.stats.actions.inUse, 2, "only active and idle keep sampling after interruptions");
  interrupt(2); playback.update(.6);
  close(relativeAngle(), 1.2, "latest preview wins");
  close(prop.scale.x, 0, "previous prop disappears");
  assert.equal(playback.update(3), true, "only current gesture completes");
  assert.equal(playback.update(.1), false);
  close(relativeAngle(), 0, "settles to rest");
  assert.equal(mixer.stats.actions.inUse, 1);
  mixer.stopAllAction(); mixer.uncacheRoot(root);
});
