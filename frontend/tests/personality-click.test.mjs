import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { AnimationMixer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

test('character clicks play varied personality clips, resume held poses, and ignore dragging and reduced motion', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true }), original = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let vite, renderer;
  try {
    const { createRoot } = await import('react-dom/client');
    const moduleId = '\0fitting-test-fiber';
    vite = await createServer({ plugins: [{ name: 'frame-test', enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/GarageEmotePlayer.tsx')) return code
          .replaceAll('from "@react-three/fiber"', 'from "virtual:fitting-fiber"')
          .replace('from "./DriverBag"', 'from "virtual:fitting-fiber"');
      },
      resolveId(source, importer) { if (source === 'virtual:fitting-fiber' || (source === '@react-three/fiber' && importer?.endsWith('/GarageEmotePlayer.tsx'))) return moduleId; },
      load(id) { if (id === moduleId) return `import { useLayoutEffect } from 'react'; export const frames = new Set(); export let invalidations = 0;
        export const DriverBag = () => null;
        const invalidate = () => invalidations++; export function useThree(select) { return select({ invalidate }); }
        export function useFrame(callback) { useLayoutEffect(() => { frames.add(callback); return () => frames.delete(callback); }, [callback]); }`; }
    }], server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const { GarageEmotePlayer } = await vite.ssrLoadModule('/src/game/characters/GarageEmotePlayer.tsx');
    const fiber = await vite.ssrLoadModule('virtual:fitting-fiber');
    const { frames } = fiber;
    const { useCharacterPreviewStore: preview } = await vite.ssrLoadModule('/src/game/characters/characterPreviewStore.ts');
    const { useFittingTurnStore: turns } = await vite.ssrLoadModule('/src/game/characters/fittingControlsStore.ts');
    const { usePreferencesStore: preferences } = await vite.ssrLoadModule('/src/store/preferences/preferencesStore.ts');
    const rig = await readFile('tests/fixtures/villager-female-rig.json', 'utf8');
    const { scene } = await new GLTFLoader().parseAsync(rig, '');
    scene.name = 'garage-villager-female';
    preferences.setState({ reducedMotion: false }); preview.setState({ playbackPaused: true, automaticEmotes: false, emote: null, insideCar: false });
    turns.setState({ suppressClickUntil: 0 });
    // The DOM only hosts React hooks; the real skeleton, clip compiler and mixer are exercised below.
    const error = console.error; t.mock.method(console, 'error', (...args) => { if (/unrecognized|non-boolean attribute/.test(String(args[0]))) return; error(...args); });
    const baseClips = [], sequenceActions = [];
    const clipAction = AnimationMixer.prototype.clipAction;
    t.mock.method(AnimationMixer.prototype, 'clipAction', function (clip, ...args) {
      if (clip.name.startsWith('002 ')) baseClips.push(clip);
      const action = clipAction.call(this, clip, ...args);
      if (clip.name.startsWith('pose-sequence ')) sequenceActions.push(action);
      return action;
    });
    renderer = createRoot(document.getElementById('root'));
    const render = props => act(async () => renderer.render(h(GarageEmotePlayer, {
      root: scene, previewPacks: true, personality: 'tsundere', ...props,
    })));
    await render();
    const primitive = document.querySelector('primitive');
    const click = delta => {
      const random = Math.random; Math.random = () => 0;
      try { primitive[Object.keys(primitive).find(key => key.startsWith('__reactProps'))].onClick({ delta, stopPropagation() {} }); }
      finally { Math.random = random; }
    };
    const tick = seconds => { for (let n = 0; n < seconds * 60; n++) for (const frame of frames) frame({}, 1 / 60); };
    await act(async () => click(0)); assert.equal(preview.getState().emote.id, '041'); assert.equal(preview.getState().playbackPaused, false);
    assert.equal(frames.size, 1, 'one animation frame callback is registered');
    const shoulder = scene.getObjectByName('upperarm_r'), rest = shoulder.quaternion.clone();
    await act(async () => tick(1)); assert(rest.angleTo(shoulder.quaternion) > .01, 'a personality click produces actual skeletal animation');
    await act(async () => click(0)); assert.equal(preview.getState().emote.id, '042', 'same random input still excludes the last clip');
    const second = preview.getState().emote;
    await act(async () => click(20)); assert.equal(preview.getState().emote, second, 'drag release does not play a clip');
    turns.setState({ suppressClickUntil: performance.now() + 1000 });
    await act(async () => click(0)); assert.equal(preview.getState().emote, second, 'dragging back to the start also suppresses a click');
    turns.setState({ suppressClickUntil: 0 });
    await act(async () => preferences.setState({ reducedMotion: true }));
    await act(async () => click(0)); assert.equal(preview.getState().emote, second);

    await act(async () => preferences.setState({ reducedMotion: false }));
    await act(async () => tick(.5));
    await render({ previewPacks: false });
    assert(rest.angleTo(shoulder.quaternion) < .001, 'leaving wardrobe restores the prepared rig pose');
    await render();
    assert.equal(baseClips.length, 4, 'each playback reset binds the base tracks');
    assert(baseClips.every(clip => clip === baseClips[0]), 'the same rig reuses its compiled tracks across modes');
    assert.equal(frames.size, 1, 'switching modes retains a single frame callback');

    const { scene: replacement } = await new GLTFLoader().parseAsync(rig, '');
    await render({ root: replacement });
    assert.notEqual(baseClips.at(-1), baseClips[0], 'a new rig compiles tracks for its own joints');
    const replacementClip = baseClips.at(-1);
    assert(replacementClip.tracks.some(track => track.name === replacement.uuid + '.position'));
    await render({ root: replacement, bag: true });
    assert.notEqual(baseClips.at(-1), replacementClip, 'the held bag changes the base clip set');

    for (const model of ['female', 'male']) {
      const data = await readFile(`tests/fixtures/villager-${model}-rig.json`, 'utf8');
      const { scene: poseRig } = await new GLTFLoader().parseAsync(data, '');
      poseRig.name = `garage-villager-${model}`;
      const head = poseRig.getObjectByName('head');
      const arm = poseRig.getObjectByName('upperarm_r');
      await render({ root: poseRig });
      const play = emote => preview.setState({ emote, playbackPaused: false });
      play({ id: 'pose-attentive' });
      tick(2);
      const start = head.quaternion.clone(), restingArm = arm.quaternion.clone();
      play({ id: 'pose-weight-shift' });
      tick(2);
      const end = head.quaternion.clone();
      assert(start.angleTo(end) > .05, `${model}: standalone poses are distinct`);

      const sequence = { id: 'pose-sequence', sequence: { from: 'pose-attentive', motion: '010', to: 'pose-weight-shift' } };
      play(sequence);
      tick(1.3); // release the previous hold, then settle into the start pose
      assert(head.quaternion.angleTo(start) < .001, `${model}: sequence holds the selected start`);
      tick(1.2);
      assert(arm.quaternion.angleTo(restingArm) > .1, `${model}: the wave moves the arm between poses`);
      tick(3);
      assert(head.quaternion.angleTo(end) < .001, `${model}: sequence stays at the selected end`);

      play({ ...sequence, sequence: { ...sequence.sequence, to: 'pose-attentive' } });
      tick(5);
      assert(head.quaternion.angleTo(start) < .001, `${model}: replay uses the new endpoint`);
      play(sequence);
      tick(.1);
      assert(sequenceActions.at(-1).time > .9 && sequenceActions.at(-1).getEffectiveWeight() === 1,
        `${model}: continuing from a matching hold immediately plays the transition at full weight`);
      play(null);
      tick(1);
      assert(head.quaternion.angleTo(start) > .05, `${model}: returning to idle releases the hold`);

      const { SELECTION_POSES, SELECTION_EMOTES } = await vite.ssrLoadModule('/src/game/characters/selectionPoses.ts');
      const { availableFinderEmotes, matchesEmote } = await vite.ssrLoadModule('/src/game/characters/emoteFinder.ts');
      const { findGaragePreviewEmote, garagePreviewCollection } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
      const poses = new Map();
      const capture = () => ['upperarm_l', 'lowerarm_l', 'upperarm_r', 'calf_r', 'head'].map(name => poseRig.getObjectByName(name).quaternion.clone());
      const difference = (a, b) => Math.max(...a.map((joint, index) => joint.clone().normalize().angleTo(b[index].clone().normalize())));
      for (const stance of SELECTION_POSES) {
        const motion = findGaragePreviewEmote(stance.emoteId, false);
        for (const bag of [false, true]) {
          const matches = availableFinderEmotes(bag).filter(item => item.id === motion.id);
          assert.equal(matches.length, 1, 'the motion has one gallery entry');
          assert(matchesEmote(matches[0], ['rest', 'stance']));
          assert.equal(findGaragePreviewEmote(motion.id, bag), motion, 'favorites replay the same motion');
          assert.equal(garagePreviewCollection('Garage', bag).filter(item => item.id === motion.id).length, 1);
        }
        play({ id: motion.id });
        tick(.2);
        const entering = capture();
        tick(1.2);
        const holding = capture();
        assert(difference(entering, holding) > .1, `${model}: ${stance.name} enters its stance`);
        tick(.9);
        assert(difference(capture(), holding) < .001, `${model}: ${stance.name} holds its stance (delta ${difference(capture(), holding)})`);
        poses.set(stance.id, holding);
        tick(2.2);
        assert(difference(capture(), holding) > .1, `${model}: ${stance.name} exits the hold`);
      }
      let now = performance.now();
      const clock = t.mock.method(performance, 'now', () => now);
      const frameAfter = ms => {
        now += ms;
        // The fiber clock can include arbitrary demand-render idle intervals.
        for (const frame of frames) frame({}, 5);
      };
      const timers = new Map();
      let nextTimer = 0;
      const setTimer = t.mock.method(dom.window, 'setTimeout', (callback, ms) => {
        timers.set(++nextTimer, { callback, ms });
        return nextTimer;
      });
      const clearTimer = t.mock.method(dom.window, 'clearTimeout', id => timers.delete(id));
      let finished = 0;
      const onSelectionEnd = () => finished++;
      for (const [index, stance] of SELECTION_POSES.entries()) {
        await render({ root: poseRig, previewPacks: false, rosterEmote: SELECTION_EMOTES[index], onSelectionEnd });
        const rest = capture();
        const before = fiber.invalidations;
        frameAfter(10000);
        assert.equal(finished, index, 'a new request starts at zero after a long idle');
        frameAfter(410); frameAfter(490); frameAfter(400);
        assert(difference(capture(), poses.get(stance.id)) < .001,
          `${model}: selection and gallery show the same ${stance.name} skeleton`);
        assert(fiber.invalidations > before, 'the roster requests frames while a clip plays');
        assert.equal(timers.size, 1, 'the static hold schedules exactly one wake');
        const [id, timer] = [...timers.entries()][0];
        assert(Math.abs(timer.ms - 1500) < 1, `slow frames still leave 1.5 seconds of the hold, got ${timer.ms}`);
        const heldDraws = fiber.invalidations;
        frameAfter(550);
        assert.equal(fiber.invalidations, heldDraws, 'camera redraws do not animate a stationary pose');
        timers.delete(id);
        now += index === 1 ? 2200 : 1150; // Resume at 4.05s or 3.00s, after the hold deadline.
        timer.callback();
        frameAfter(0);
        if (index !== 1) {
          frameAfter(970);
          assert.equal(finished, index, 'the exit is still playing at 3.97s');
          frameAfter(65);
        }
        assert.equal(finished, index + 1, 'one completion after the exit');
        assert(difference(capture(), rest) < .001, 'the roster returns to its neutral rig');
        const settled = fiber.invalidations;
        frameAfter(6000);
        assert.equal(fiber.invalidations, settled, 'the roster remains idle between authored emotes');
        assert.equal(finished, index + 1);
      }
      for (const id of ['010', '159']) {
        const motion = findGaragePreviewEmote(id, false);
        const completed = finished;
        const rest = capture();
        await render({ root: poseRig, previewPacks: false, rosterEmote: motion, onSelectionEnd });
        frameAfter(6000);
        frameAfter(1000 * motion.duration * .35);
        const midway = capture();
        assert(difference(rest, midway) > .1, 'the standing gesture uses the same rig');
        if (motion.prop) assert(poseRig.getObjectByName('emote-prop-' + motion.prop)?.visible, 'the personality prop is shown on its authored key');
        frameAfter(1000 * motion.duration * .22);
        assert(difference(capture(), midway) > .01, 'a moving gesture keeps sampling through the middle');
        assert.equal(timers.size, 0, 'an ordinary wave or phone gesture has no fabricated static hold');
        frameAfter(1000 * motion.duration * .44);
        assert.equal(finished, completed + 1, 'duration follows the authored clip');
        assert(difference(capture(), rest) < .001);
        const idleDraws = fiber.invalidations;
        frameAfter(6500);
        assert.equal(fiber.invalidations, idleDraws);
      }
      await render({ root: poseRig, previewPacks: false, rosterEmote: SELECTION_EMOTES[0], onSelectionEnd });
      frameAfter(6000); frameAfter(1300);
      assert.equal(timers.size, 1);
      await render({ root: poseRig, previewPacks: false, rosterEmote: SELECTION_EMOTES[1], onSelectionEnd });
      assert.equal(timers.size, 0, 'replacing a held request cancels its wake');
      setTimer.mock.restore(); clearTimer.mock.restore(); clock.mock.restore();
    }
  } finally {
    if (renderer) await act(async () => renderer.unmount()); await vite?.close(); dom.window.close();
    for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
