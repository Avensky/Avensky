import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Drei's Node entry uses Three's CommonJS manager; use the same instance.
const { DefaultLoadingManager } = createRequire(import.meta.url)('three');
import { useProgress } from '@react-three/drei';
import { isAssetLoadingComplete } from '../src/game/tools/assetLoading.ts';
import { embeddedTextureImages } from '../src/assets/embeddedTextureImages.ts';
import { TextureLoader } from 'three';

test('embedded character textures use the document image loader while URI and compressed textures retain their loaders', t => {
  const prior = globalThis.document;
  globalThis.document = {};
  t.after(() => { if (prior === undefined) delete globalThis.document; else globalThis.document = prior; });
  const bitmap = { isImageBitmapLoader: true };
  const custom = {};
  const parser = {
    json: { images: [{ bufferView: 0 }, { uri: 'fabric.webp' }] }, options: {},
    textureLoader: bitmap, loadImageSource: (_index, loader) => loader,
  };
  embeddedTextureImages(parser).beforeRoot();
  assert.ok(parser.loadImageSource(0, bitmap) instanceof TextureLoader);
  assert.equal(parser.loadImageSource(1, bitmap), bitmap);
  assert.equal(parser.loadImageSource(0, custom), custom);
});

test('collider setup completes from Drei’s untouched, zero-file loading state', () => {
  const initial = useProgress.getState();
  assert.equal(initial.active, false);
  assert.equal(initial.progress, 0);
  assert.equal(initial.total, 0);
  assert.equal(isAssetLoadingComplete(initial), true);
});

test('real asset loading keeps the gate closed until the last pending file finishes', () => {
  DefaultLoadingManager.itemStart('test-vehicle.glb');
  DefaultLoadingManager.itemStart('test-road.glb');
  assert.equal(isAssetLoadingComplete(useProgress.getState()), false);
  DefaultLoadingManager.itemEnd('test-vehicle.glb');
  assert.equal(isAssetLoadingComplete(useProgress.getState()), false);
  DefaultLoadingManager.itemEnd('test-road.glb');
  assert.equal(isAssetLoadingComplete(useProgress.getState()), true);
});

test('active requests block completion even when cached progress still reads 100%', () => {
  assert.equal(isAssetLoadingComplete({ active: true, progress: 100, total: 1 }), false);
  assert.equal(isAssetLoadingComplete({ active: true, progress: 0, total: 0 }), false);
});
