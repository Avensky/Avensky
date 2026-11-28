import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { Bone, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";

test("Mia's fitted ends shorten and rest against the worn torso while roots follow the head", async () => {
  const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error" });
  try {
    const { fitMiaPonytail } = await vite.ssrLoadModule("/src/game/characters/fittedWardrobe/miaFit.ts");
    const { bindFittedHair } = await vite.ssrLoadModule("/src/game/characters/fittedHair.ts");
    const actor = new Group();
    const head = new Bone(), spine = new Bone(), chest = new Bone();
    head.name = "head";
    spine.name = "spine_05";
    chest.name = "jacket-chest";
    actor.add(spine);
    spine.add(head, chest);
    const skeleton = new Skeleton([head, spine, chest]);
    const body = new SkinnedMesh(new BoxGeometry(.3, .52, .19).translate(0, 1.21, 0));
    const jacket = new SkinnedMesh(new BoxGeometry(.33, .5, .23).translate(0, 1.20, 0));
    jacket.name = "CLOTH_TOP_COAT";
    const shellCount = jacket.geometry.attributes.position.count;
    const shellJoints = new Uint16Array(shellCount * 4), shellWeights = new Float32Array(shellCount * 4);
    for (let i = 0; i < shellCount; i++) { shellJoints[i * 4] = 2; shellWeights[i * 4] = 1; }
    jacket.geometry.setAttribute("skinIndex", new Uint16BufferAttribute(shellJoints, 4));
    jacket.geometry.setAttribute("skinWeight", new Float32BufferAttribute(shellWeights, 4));
    jacket.bind(skeleton);
    actor.add(jacket);
    const source = new Group();
    source.name = "Mia_01";
    for (const [section, x, z] of [[8, 0, -.22], [4, -.075, .022], [5, .075, .022], [0, 0, 0]]) {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute([x, 1.54, z, x, 1.29, z, x, 1.16, z], 3));
      geo.setAttribute("_avensky_groom", new Float32BufferAttribute([0, .5, section, .55, .5, section, 1, .5, section], 3));
      geo.setAttribute("skinIndex", new Uint16BufferAttribute(Array(12).fill(0), 4));
      geo.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
      const part = new SkinnedMesh(geo);
      part.bind(skeleton);
      source.add(part);
    }
    const hat = new SkinnedMesh(source.children[0].geometry, new MeshStandardMaterial());
    hat.material.name = "Crown backing";
    hat.bind(skeleton);
    source.add(hat);
    const hair = bindFittedHair(source, skeleton);
    assert.equal(hair.children.length, 4);
    actor.add(hair);
    const dispose = fitMiaPonytail(hair, actor, body);
    const [tail, left, right, crown] = hair.children;
    const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < .0001, `${actual} ≈ ${expected}`);
    const vertex = (mesh, i) => new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
    close(vertex(tail, 2).y, 1.54 - .38 * .72);
    close(vertex(left, 2).y, 1.54 - .38 * .91);
    close(vertex(tail, 2).z, -.120);
    for (const braid of [left, right]) close(vertex(braid, 2).z, .122);
    assert.deepEqual(vertex(tail, 0), vertex(source.children[0], 0));
    assert.equal(crown.geometry, source.children[3].geometry);
    close(vertex(source.children[0], 2).z, -.22);
    head.rotation.y = .52;
    actor.updateMatrixWorld(true);
    for (const mesh of [left, right, tail]) {
      assert.ok(mesh.getVertexPosition(2, new Vector3()).distanceTo(vertex(mesh, 2)) < .0001, "chest contact survives a head turn");
      assert.ok(mesh.getVertexPosition(0, new Vector3()).distanceTo(vertex(mesh, 0)) > .008, "the roots turn with the head");
    }
    chest.position.z = .025;
    actor.updateMatrixWorld(true);
    for (const braid of [left, right]) close(braid.getVertexPosition(2, new Vector3()).z, .147);
    close(tail.getVertexPosition(2, new Vector3()).z, -.120);
    dispose();

    // A raised bodice edge sits in front of the bare neck. The unsupported
    // portion must hang forward and approach that edge over several rows.
    const bodice = new SkinnedMesh(new BoxGeometry(.3, .30, .30).translate(0, 1.20, 0));
    bodice.name = "CLOTH_TOP_CORSET";
    bodice.bind(skeleton);
    actor.add(bodice);
    const samples = Array.from({ length: 48 }, (_, i) => 1.54 - .005 * i);
    const strand = new BufferGeometry()
      .setAttribute("position", new Float32BufferAttribute(samples.flatMap(y => [.075, y, .08]), 3))
      .setAttribute("_avensky_groom", new Float32BufferAttribute(samples.flatMap((_, i) => [i / (samples.length - 1), .5, 4]), 3));
    const projected = new SkinnedMesh(strand);
    projected.bind(skeleton);
    const release = fitMiaPonytail(projected, actor, body);
    const points = samples.map((_, i) => vertex(projected, i));
    for (const [i, point] of points.entries()) {
      assert.ok(point.z >= .07999, "a hanging braid stays in front of the hollow under the chin");
      if (i && point.y < 1.43) assert.ok(Math.abs(point.z - points[i - 1].z) < .008,
        "the front braid bridges the bodice edge without a horizontal step");
    }
    release();
    const { createPonySway } = await vite.ssrLoadModule("/src/game/characters/fittedWardrobe/ponySway.ts");
    const sway = createPonySway(actor, head);
    sway.step(1 / 60, true);
    for (let i = 0; i < 15; i++) { head.rotation.y += .025; sway.step(1 / 60, true); }
    assert.ok(sway.offset.length() > .001 && sway.offset.length() < .015);
    assert.ok(sway.offset.z <= 0);
    for (let i = 0; i < 75; i++) sway.step(1 / 30, true);
    assert.equal(sway.offset.length(), 0);
    assert.equal(sway.step(1 / 60, true), false);
  } finally { await vite.close(); }
});
