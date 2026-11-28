import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { Bone, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, ShaderLib, Skeleton, SkinnedMesh, Texture, Uint16BufferAttribute, Vector3 } from "three";

test("Mia's ponytail shortens and her face braids hang onto the worn torso through head turns", async () => {
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
      // One braid floats in front of the coat and the other starts inside it.
      const depths = section === 4 ? [.13, .19, .22] : [z, z, z];
      geo.setAttribute("position", new Float32BufferAttribute([x, 1.54, depths[0], x, 1.29, depths[1], x, 1.16, depths[2]], 3));
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
    assert.ok(vertex(left, 2).y >= vertex(source.children[1], 2).y - .0001 && vertex(left, 2).y < vertex(left, 1).y,
      "the tip hangs below the middle of the braid without stretching the authored length");
    close(vertex(tail, 2).z, -.120);
    const touches = (point, depth) => assert.ok(point.z >= depth - .0001 && point.z <= depth + .008,
      `braid should rest against the surface at ${depth} m, got ${point.z} m`);
    for (const braid of [left, right]) {
      touches(vertex(braid, 1), .115);
      touches(vertex(braid, 2), .115);
    }
    assert.deepEqual(vertex(left, 0), vertex(source.children[1], 0), "the temple attachment stays in place");
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
    for (const braid of [left, right]) touches(braid.getVertexPosition(2, new Vector3()), .115 + .025);
    close(tail.getVertexPosition(2, new Vector3()).z, -.120);
    dispose();

    jacket.visible = false;
    const bareHair = bindFittedHair(source, skeleton);
    const releaseBare = fitMiaPonytail(bareHair, actor, body);
    for (const braid of bareHair.children.slice(1, 3)) touches(vertex(braid, 2), .095);
    releaseBare();
    jacket.visible = true;

    jacket.userData.clothingPiece = "dress";
    const dressHair = bindFittedHair(source, skeleton);
    const releaseDress = fitMiaPonytail(dressHair, actor, body);
    for (const braid of dressHair.children.slice(1, 3)) touches(vertex(braid, 2), .115);
    releaseDress();
    delete jacket.userData.clothingPiece;

    // A raised bodice edge sits in front of the bare neck. The unsupported
    // portion must hang forward and approach that edge over several rows.
    jacket.visible = false;
    const neck = new SkinnedMesh(new BoxGeometry(.26, .50, .07).translate(0, 1.27, 0));
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
    const release = fitMiaPonytail(projected, actor, neck);
    const points = samples.map((_, i) => vertex(projected, i));
    for (const [i, point] of points.entries()) {
      assert.ok(point.z >= .077, "the unsupported braid falls from the jaw without bending back into the hollow of the neck");
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

test("Mia collar locks share the selected dye across atlas and vertex-colored exports", async () => {
  const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false }, logLevel: "error" });
  const geometry = new BufferGeometry(), atlas = new Texture(), spring = new Vector3();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 1.47, 0], 3));
  geometry.setAttribute("_avensky_groom", new Float32BufferAttribute([1, .5, 6], 3));
  geometry.setAttribute("_avensky_tail", new Float32BufferAttribute([0], 1));
  try {
    const { prepareHairDye } = await vite.ssrLoadModule("/src/game/characters/fittedWardrobe/hairDye.ts");
    const { HAIR_COLOR_THEMES } = await vite.ssrLoadModule("/src/game/characters/fittedWardrobe/hairColors.ts");
    const { DEFAULT_HAIR_GROOM } = await vite.ssrLoadModule("/src/game/characters/fittedWardrobe/hairGroom.ts");
    for (const map of [null, atlas]) {
      const material = new MeshStandardMaterial({ color: 0x776650, map, vertexColors: true });
      const setPalette = prepareHairDye(material, geometry, false, spring);
      const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
      material.onBeforeCompile(shader);
      const { avenskyPieceBase, avenskyPieceMix, avenskyTailOffset } = shader.uniforms;
      assert.equal(avenskyTailOffset.value, spring);
      assert.ok(shader.fragmentShader.indexOf("vec3 pigment") > shader.fragmentShader.indexOf("#include <color_fragment>"),
        "dye replaces the final baked hue, including base-color factors and vertex colors");
      const palette = HAIR_COLOR_THEMES.Red;
      setPalette(palette);
      assert.equal(material.color.getHex(), 0x776650, "whole and per-section dye see the same original strand luminance");
      for (const index of [2, 3, 6, 7]) {
        assert.equal(avenskyPieceMix.value[index].z, 0);
        assert.equal("#" + avenskyPieceBase.value[index].getHexString(), palette.base);
      }
      setPalette(palette, true, { ...DEFAULT_HAIR_GROOM, pieces: { nape: palette } });
      assert.equal(avenskyPieceMix.value[6].z, 0, "an explicit nape pigment can override Original");
      assert.equal(avenskyPieceMix.value[7].z, 1);
      setPalette(palette, true);
      assert.equal(avenskyPieceMix.value[6].z, 1);
      assert.equal(material.color.getHex(), 0x776650, "Original restores the strand material color");
      material.dispose();
    }
  } finally {
    geometry.dispose(); atlas.dispose(); await vite.close();
  }
});
