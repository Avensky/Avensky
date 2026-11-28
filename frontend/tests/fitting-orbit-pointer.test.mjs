import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, events, extend } from '@react-three/fiber';
import { JSDOM } from 'jsdom';
import { act, createElement as h, Fragment } from 'react';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three';
import { createServer } from 'vite';

test('mouse and touch drags pick the actor or orbit the garage independently', async () => {
  const dom = new JSDOM('<div id="preview"><canvas></canvas></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const globals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const canvas = document.querySelector('canvas'), captured = new Set();
  canvas.setPointerCapture = id => captured.add(id);
  canvas.hasPointerCapture = id => captured.has(id);
  canvas.releasePointerCapture = id => captured.delete(id);
  const pointer = (type, pointerId, clientX, clientY, pointerType = 'mouse', isPrimary = true) => canvas.dispatchEvent(
    new dom.window.PointerEvent(type, { bubbles: true, pointerId, clientX, clientY, pointerType, isPrimary }),
  );
  let vite, root;
  try {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const { FittingCameraOrbit } = await vite.ssrLoadModule('/src/game/characters/FittingCameraOrbit.tsx');
    const { CharacterTurntable } = await vite.ssrLoadModule('/src/game/characters/CharacterTurntable.tsx');
    const { useFittingTurnStore } = await vite.ssrLoadModule('/src/game/characters/fittingControlsStore.ts');
    extend({ BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry });
    const camera = new PerspectiveCamera(45, 1, .1, 100);
    camera.position.z = 4;
    root = createRoot(canvas);
    await root.configure({ events, camera, frameloop: 'never', size: { width: 200, height: 200, top: 0, left: 0 },
      gl: { render() {}, setSize() {}, setPixelRatio() {} } });
    const deltas = [];
    let releases = 0;
    let store, clicks = 0;
    const render = (enabled) => act(async () => {
      store = root.render(h(Fragment, null,
        h('primitive', { object: camera }, h(FittingCameraOrbit, { onDrag: (x, y) => deltas.push([x, y]), onDragEnd: () => { releases++; } })),
        h(CharacterTurntable, { enabled }, h('mesh', { name: 'test-driver', onClick: () => { clicks++; } },
          h('boxGeometry', { args: [1, 1, 1] }), h('meshBasicMaterial')))));
    });
    await render(true);
    store.getState().scene.updateMatrixWorld(true);
    const driver = store.getState().scene.getObjectByName('test-driver');
    const raycast = driver.raycast;
    let driverRaycasts = 0;
    driver.raycast = function (...args) {
      driverRaycasts++;
      return raycast.apply(this, args);
    };

    for (let x = 50; x < 150; x++) pointer('pointermove', 1, x, 100);
    assert.equal(driverRaycasts, 0, 'passive hovering never intersects the actor');

    pointer('pointerdown', 1, 20, 25);
    assert(captured.has(1));
    pointer('pointermove', 1, 35, 33);
    pointer('pointerup', 1, 35, 33);
    assert(!captured.has(1));
    assert.deepEqual(deltas, [[15, 8]]);
    assert.equal(releases, 1, 'a completed orbit arms the idle timer once');
    assert.equal(useFittingTurnStore.getState().characterYaw, 0);

    pointer('pointerdown', 2, 20, 25, 'touch');
    pointer('pointerdown', 20, 100, 100, 'touch', false);
    pointer('pointermove', 20, 127, 100, 'touch', false);
    pointer('pointerup', 20, 127, 100, 'touch', false);
    assert.equal(useFittingTurnStore.getState().characterYaw, 0, 'another finger cannot steal a room drag');
    pointer('pointermove', 2, 28, 39, 'touch');
    pointer('pointercancel', 2, 28, 39, 'touch');
    pointer('pointermove', 2, 50, 50, 'touch');
    assert.deepEqual(deltas, [[15, 8], [8, 14]], 'cancelled touches stop feeding the camera');

    pointer('pointerdown', 3, 20, 25);
    pointer('pointermove', 3, 26, 33);
    captured.delete(3);
    pointer('lostpointercapture', 3, 26, 33);
    pointer('pointermove', 3, 50, 50);
    assert.deepEqual(deltas, [[15, 8], [8, 14], [6, 8]], 'losing capture ends the drag');

    await act(async () => store.getState().events.connect(document.getElementById('preview')));
    driverRaycasts = 0;
    pointer('pointerdown', 4, 100, 100);
    assert(driverRaycasts > 0, 'the initial drag uses exact mesh picking');
    assert(captured.has(4));
    driverRaycasts = 0;
    for (let x = 101; x <= 200; x++) pointer('pointermove', 4, x, 100);
    assert.equal(driverRaycasts, 0, 'dragging off the model uses the captured pointer');
    pointer('pointerup', 4, 200, 100);
    assert.equal(deltas.length, 3, 'a near model hit takes precedence over the orbit surface');
    assert(Math.abs(useFittingTurnStore.getState().characterYaw - .8) < 1e-9);
    assert.equal(useFittingTurnStore.getState().dragging, false);
    assert(useFittingTurnStore.getState().suppressClickUntil > performance.now());
    assert(!captured.has(4));

    pointer('pointerdown', 5, 100, 100);
    pointer('pointerup', 5, 100, 100);
    pointer('click', 5, 100, 100);
    assert.equal(clicks, 1, 'a tap still reaches the actor click handler');
    assert.equal(useFittingTurnStore.getState().suppressClickUntil, 0);

    const beforeTouch = useFittingTurnStore.getState().characterYaw;
    pointer('pointerdown', 12, 100, 100, 'touch');
    assert(captured.has(12), 'touching the actor owns the drag');
    pointer('pointermove', 12, 102, 101, 'touch');
    assert.equal(useFittingTurnStore.getState().characterYaw, beforeTouch, 'tap jitter does not turn the model');
    pointer('pointermove', 12, 145, 105, 'touch');
    pointer('pointerup', 12, 145, 105, 'touch');
    assert(Math.abs(useFittingTurnStore.getState().characterYaw - beforeTouch - .36) < 1e-9);
    assert.equal(deltas.length, 3, 'turning the actor on touch does not move the garage');

    pointer('pointerdown', 13, 100, 100, 'touch');
    pointer('pointermove', 13, 100, 122, 'touch');
    pointer('pointermove', 13, 100, 100, 'touch');
    pointer('pointerup', 13, 100, 100, 'touch');
    assert(useFittingTurnStore.getState().suppressClickUntil > performance.now(),
      'a vertical touch drag that returns to its origin cannot trigger a tap emote');
    pointer('pointerdown', 14, 100, 100, 'touch');
    pointer('pointerup', 14, 100, 100, 'touch');
    pointer('click', 14, 100, 100, 'touch');
    assert.equal(clicks, 2, 'a deliberate actor tap after dragging still works');
    assert.equal(useFittingTurnStore.getState().suppressClickUntil, 0);

    for (const end of ['pointercancel', 'lostpointercapture']) {
      pointer('pointerdown', 6, 100, 100);
      const yaw = useFittingTurnStore.getState().characterYaw;
      pointer('pointermove', 99, 145, 100);
      assert.equal(useFittingTurnStore.getState().characterYaw, yaw, 'other pointer IDs cannot turn the actor');
      if (end === 'lostpointercapture') captured.delete(6);
      pointer(end, 6, 101, 100);
      pointer('pointermove', 6, 135, 100);
      assert.equal(useFittingTurnStore.getState().characterYaw, yaw);
      assert.equal(useFittingTurnStore.getState().dragging, false);
      assert(!captured.has(6));
    }

    pointer('pointerdown', 7, 100, 100);
    assert(captured.has(7));
    await render(false);
    assert(!captured.has(7), 'switching away releases the active character drag');
    assert.equal(useFittingTurnStore.getState().dragging, false);
    driverRaycasts = 0;
    pointer('pointermove', 7, 120, 100);
    assert.equal(driverRaycasts, 0, 'a disabled turntable ignores hovering');

    const { PreviewTurntable, VehicleDragVolume } = await vite.ssrLoadModule('/src/game/preview/PreviewTurntable.tsx');
    const bounds = new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5));
    let table;
    await act(async () => {
      store = root.render(h(Fragment, null,
        h('primitive', { object: camera }, h(FittingCameraOrbit, { onDrag: (x, y) => deltas.push([x, y]) })),
        h(PreviewTurntable, { onReady: object => { table = object; }, inspectExterior: true, spin: false },
          h(VehicleDragVolume, { bounds }))));
    });
    store.getState().scene.updateMatrixWorld(true);
    const hitVolume = table.getObjectByName('vehicle-inspection-drag');
    const before = deltas.length;
    let vehicleRaycasts = 0;
    const pick = hitVolume.raycast;
    hitVolume.raycast = function (...args) { vehicleRaycasts++; return pick.apply(this, args); };
    for (let x = 25; x < 50; x++) pointer('pointermove', 8, x, 100, 'touch');
    assert.equal(vehicleRaycasts, 0, 'the workshop only picks the hull on press');
    pointer('pointerdown', 8, 100, 100, 'touch');
    pointer('pointermove', 8, 130, 100, 'touch');
    pointer('pointerup', 8, 130, 100, 'touch');
    store.getState().advance(0, false);
    store.getState().advance(.1, false);
    assert.ok(table.rotation.y > 0, 'dragging the inspected vehicle turns it');
    assert.equal(deltas.length, before, 'turning the vehicle leaves the room camera alone');
    pointer('pointerdown', 9, 10, 15, 'touch');
    pointer('pointermove', 9, 22, 17, 'touch');
    pointer('pointerup', 9, 22, 17, 'touch');
    assert.deepEqual(deltas.at(-1), [12, 2], 'the open garage beside the vehicle orbits the camera');
    for (const [width, height] of [[390, 844], [844, 390]]) {
      await act(async () => store.getState().setSize(width, height, 0, 0));
      for (const heading of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 2 * Math.PI]) {
        camera.position.set(4 * Math.sin(heading), .5, 4 * Math.cos(heading));
        camera.lookAt(0, 0, 0);
        store.getState().scene.updateMatrixWorld(true);
        const previous = deltas.length;
        pointer('pointerdown', 10, 52, 25, 'touch');
        pointer('pointermove', 10, 22, 25, 'touch');
        pointer('pointerup', 10, 22, 25, 'touch');
        assert.equal(deltas.length, previous + 1, 'can re-grab the room after passing the rear of the model');
        assert.deepEqual(deltas.at(-1), [-30, 0], 'the reverse swipe is preserved at every heading');
      }
    }
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
