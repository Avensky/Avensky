import { Color, ShaderChunk, Vector2, Vector3, type BufferGeometry, type MeshStandardMaterial } from "three";
import { DEFAULT_HAIR_PALETTE, type HairPalette } from "./hairColors";
import { DEFAULT_HAIR_GROOM, HAIR_PIECES, type HairGroom } from "./hairGroom";

export function prepareHairDye(material: MeshStandardMaterial, geometry: BufferGeometry, curly: boolean, tailOffset?: Vector3, male = false) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  // Convert the taller warrior's authored hair coordinates into the shared head profile.
  const rigHeight = male ? .172 : 0;
  const inverseLength = 1 / Math.max(.085, 1.642 + rigHeight - (geometry.boundingBox?.min.y ?? 1.5));
  const validVector = (name: string) => {
    const attribute = geometry.getAttribute(name);
    return attribute?.itemSize === 3 && attribute.count === geometry.attributes.position.count;
  };
  const groomColor = validVector("_avensky_groom");
  const groomShape = groomColor && validVector("_avensky_groom_lift") && validVector("_avensky_groom_width");
  const tailMask = geometry.getAttribute("_avensky_tail");
  const maskedTail = tailMask?.itemSize === 1 && tailMask.count === geometry.attributes.position.count;
  const sway = tailOffset && (groomColor || maskedTail);
  const pieces = HAIR_PIECES.length;
  const pieceUniforms = groomColor ? {
    avenskyPieceBase: { value: HAIR_PIECES.map(() => new Color()) },
    avenskyPieceRoots: { value: HAIR_PIECES.map(() => new Color()) },
    avenskyPieceHighlights: { value: HAIR_PIECES.map(() => new Color()) },
    avenskyPieceTips: { value: HAIR_PIECES.map(() => new Color()) },
    avenskyPieceMix: { value: HAIR_PIECES.map(() => new Vector3()) },
  } : undefined;
  const shape = groomShape ? { value: new Vector2() } : undefined;
  const uniforms = {
    avenskyHairRigOffset: { value: new Vector2(rigHeight, male ? .020 : 0) },
    avenskyHairBase: { value: new Color() },
    avenskyHairRoots: { value: new Color() },
    avenskyHairHighlights: { value: new Color() },
    avenskyHairTips: { value: new Color() },
    avenskyHairMix: { value: new Vector2() },
    avenskyHairOriginal: { value: 1 },
    avenskyHairProfile: { value: new Vector2(inverseLength, curly ? 1 : 0) },
    // Keep the bridging strands between the root pigment and the swept hair.
    avenskyHairRootStrength: { value: material.name.endsWith("Root strands") ? .64 : .83 },
  };
  function setPalette(palette: HairPalette, original = false, groom: HairGroom = DEFAULT_HAIR_GROOM) {
    shape?.value.set(groom.volume, groom.thickness);
    if (pieceUniforms) HAIR_PIECES.forEach(([piece], i) => {
      const override = groom.pieces[piece];
      const color = override ?? palette;
      pieceUniforms.avenskyPieceBase.value[i].set(color.base);
      pieceUniforms.avenskyPieceRoots.value[i].set(color.roots);
      pieceUniforms.avenskyPieceHighlights.value[i].set(color.highlights);
      pieceUniforms.avenskyPieceTips.value[i].set(color.tips);
      pieceUniforms.avenskyPieceMix.value[i].set(color.highlightStrength, color.tipBlend, Number(!override && original));
    });
    uniforms.avenskyHairOriginal.value = Number(original);
    if (original) return;
    uniforms.avenskyHairBase.value.set(palette.base);
    uniforms.avenskyHairRoots.value.set(palette.roots);
    uniforms.avenskyHairHighlights.value.set(palette.highlights);
    uniforms.avenskyHairTips.value.set(palette.tips);
    uniforms.avenskyHairMix.value.set(palette.highlightStrength, palette.tipBlend);
  }
  setPalette(DEFAULT_HAIR_PALETTE, true);
  material.color.set(0xffffff);
  material.customProgramCacheKey = () =>
    `avensky-hair-dye-v4${sway ? "-sway" : ""}${maskedTail ? "-tail-mask" : ""}${groomColor ? "-groom" : ""}${groomShape ? "-shape" : ""}`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = "uniform vec2 avenskyHairRigOffset; varying vec3 vAvenskyHairRest;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\nvAvenskyHairRest = position - vec3(0.0, avenskyHairRigOffset);",
    );
    if (sway) {
      shader.uniforms.avenskyTailOffset = { value: tailOffset };
      const mask = maskedTail ? "_avensky_tail" : "float(abs(_avensky_groom.z - 8.0) < 0.5) * smoothstep(0.1, 1.0, _avensky_groom.x)";
      shader.vertexShader = (maskedTail ? "attribute float _avensky_tail;\n" : "") + "uniform vec3 avenskyTailOffset;\n" +
        shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          transformed += avenskyTailOffset * ${mask};
          ${groomColor ? `if (abs(_avensky_groom.z - 4.5) < 0.9) {
            float looseBraid = smoothstep(0.22, 0.96, _avensky_groom.x);
            transformed += vec3(avenskyTailOffset.x * 0.40, 0.0, -avenskyTailOffset.z * 0.27) * looseBraid;
          }` : ""}
        `);
    }
    if (pieceUniforms) {
      Object.assign(shader.uniforms, pieceUniforms);
      shader.vertexShader = "attribute vec3 _avensky_groom; varying vec3 vAvenskyGroom;\n" +
        shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvAvenskyGroom = _avensky_groom;");
      shader.fragmentShader = `
        varying vec3 vAvenskyGroom;
        uniform vec3 avenskyPieceBase[${pieces}], avenskyPieceRoots[${pieces}],
          avenskyPieceHighlights[${pieces}], avenskyPieceTips[${pieces}], avenskyPieceMix[${pieces}];
      ` + shader.fragmentShader;
    }
    if (shape) {
      shader.uniforms.avenskyGroomShape = shape;
      shader.vertexShader = "attribute vec3 _avensky_groom_lift, _avensky_groom_width; uniform vec2 avenskyGroomShape;\n" +
        shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          transformed += _avensky_groom_lift * avenskyGroomShape.x + _avensky_groom_width * avenskyGroomShape.y;
        `);
    }
    shader.fragmentShader = `
      varying vec3 vAvenskyHairRest;
      uniform vec3 avenskyHairBase, avenskyHairRoots, avenskyHairHighlights, avenskyHairTips;
      uniform vec2 avenskyHairMix, avenskyHairProfile;
      uniform float avenskyHairOriginal, avenskyHairRootStrength;
    ` + shader.fragmentShader.replace("#include <map_fragment>", ShaderChunk.map_fragment.replace("diffuseColor *= sampledDiffuseColor;", `
      // Lightness carries the strand detail. Compress baked lightness variation
      // so cards from different atlas regions share the same chosen pigment.
      ${groomColor ? `
        int piece = int(clamp(floor(vAvenskyGroom.z + 0.5), 0.0, ${pieces - 1}.0));
        vec3 selected = avenskyPieceMix[piece];
        vec3 dyeBase = avenskyPieceBase[piece], dyeRoots = avenskyPieceRoots[piece];
        vec3 dyeHighlights = avenskyPieceHighlights[piece], dyeTips = avenskyPieceTips[piece];
      ` : `
        vec3 selected = vec3(avenskyHairMix, avenskyHairOriginal);
        vec3 dyeBase = avenskyHairBase, dyeRoots = avenskyHairRoots;
        vec3 dyeHighlights = avenskyHairHighlights, dyeTips = avenskyHairTips;
      `}
      if (selected.z < 0.5) {
        float strand = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float grain = clamp(log2(max(strand, 0.008) / 0.063), -1.7, 1.7);
        float drape = clamp((1.642 - vAvenskyHairRest.y) * avenskyHairProfile.x, 0.0, 1.0);
        float shell = length((vAvenskyHairRest - vec3(0.0, 1.569, 0.012)) / vec3(0.080, 0.109, 0.103));
        float root = (1.0 - smoothstep(0.97, 1.21, shell))
                   * smoothstep(1.485, 1.580, vAvenskyHairRest.y);
        float tip = max(smoothstep(0.33, 1.0, drape),
          avenskyHairProfile.y * smoothstep(1.13, 1.78, shell) * 0.72) * selected.y;
        ${groomColor ? `
          float along = clamp(vAvenskyGroom.x, 0.0, 1.0);
          root = 1.0 - smoothstep(0.03, 0.31, along);
          tip = smoothstep(mix(0.38, 0.56, vAvenskyGroom.y), 1.0, along) * selected.y;
        ` : ""}
        vec3 pigment = mix(dyeBase, dyeRoots, root * avenskyHairRootStrength);
        pigment = mix(pigment, dyeTips, tip * (1.0 - root));
        float highlight = (0.18 + 0.49 * smoothstep(-0.56, 1.05, grain)) * selected.x * (1.0 - root * 0.66);
        ${groomColor ? "highlight *= mix(0.62, 1.24, vAvenskyGroom.y);" : ""}
        pigment = mix(pigment, dyeHighlights, highlight);
        // Give close midtones more separation without restoring baked color bands.
        float strandContrast = grain / (1.0 + 0.41 * abs(grain));
        sampledDiffuseColor.rgb = pigment * (1.0 + 0.31 * strandContrast);
      }
      diffuseColor *= sampledDiffuseColor;
    `));
  };
  material.needsUpdate = true;
  return setPalette;
}
