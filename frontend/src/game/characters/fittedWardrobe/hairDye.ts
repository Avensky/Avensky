import { Color, ShaderChunk, Vector2, type BufferGeometry, type MeshStandardMaterial, type Vector3 } from "three";
import { DEFAULT_HAIR_PALETTE, type HairPalette } from "./hairPalette";

export function prepareHairDye(material: MeshStandardMaterial, geometry: BufferGeometry, curly: boolean, tailOffset?: Vector3) {
  geometry.computeBoundingBox();
  const inverseLength = 1 / Math.max(.085, 1.642 - (geometry.boundingBox?.min.y ?? 1.5));
  const uniforms = {
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
  function setPalette(palette: HairPalette, original = false) {
    uniforms.avenskyHairOriginal.value = Number(original);
    uniforms.avenskyHairBase.value.set(palette.base);
    uniforms.avenskyHairRoots.value.set(palette.roots);
    uniforms.avenskyHairHighlights.value.set(palette.highlights);
    uniforms.avenskyHairTips.value.set(palette.tips);
    uniforms.avenskyHairMix.value.set(palette.highlightStrength, palette.tipBlend);
  }
  setPalette(DEFAULT_HAIR_PALETTE, true);
  material.color.set(0xffffff);
  material.customProgramCacheKey = () => tailOffset ? "avensky-hair-dye-v2-tail" : "avensky-hair-dye-v2";
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = "varying vec3 vAvenskyHairRest;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\nvAvenskyHairRest = position;",
    );
    if (tailOffset) {
      shader.uniforms.avenskyTailOffset = { value: tailOffset };
      shader.vertexShader = "attribute float _avensky_tail; uniform vec3 avenskyTailOffset;\n" +
        shader.vertexShader.replace("vAvenskyHairRest = position;",
          "vAvenskyHairRest = position;\ntransformed += avenskyTailOffset * _avensky_tail;");
    }
    shader.fragmentShader = `
      varying vec3 vAvenskyHairRest;
      uniform vec3 avenskyHairBase, avenskyHairRoots, avenskyHairHighlights, avenskyHairTips;
      uniform vec2 avenskyHairMix, avenskyHairProfile;
      uniform float avenskyHairOriginal, avenskyHairRootStrength;
    ` + shader.fragmentShader.replace("#include <map_fragment>", ShaderChunk.map_fragment.replace("diffuseColor *= sampledDiffuseColor;", `
      // Lightness carries the strand detail. Compress baked lightness variation
      // so cards from different atlas regions share the same chosen pigment.
      float strand = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float grain = clamp(log2(max(strand, 0.008) / 0.063), -1.7, 1.7);
      float drape = clamp((1.642 - vAvenskyHairRest.y) * avenskyHairProfile.x, 0.0, 1.0);
      float shell = length((vAvenskyHairRest - vec3(0.0, 1.569, 0.012)) / vec3(0.080, 0.109, 0.103));
      float root = (1.0 - smoothstep(0.97, 1.21, shell))
                 * smoothstep(1.485, 1.580, vAvenskyHairRest.y);
      float tip = max(smoothstep(0.33, 1.0, drape),
        avenskyHairProfile.y * smoothstep(1.13, 1.78, shell) * 0.72) * avenskyHairMix.y;
      vec3 pigment = mix(avenskyHairBase, avenskyHairRoots, root * avenskyHairRootStrength);
      pigment = mix(pigment, avenskyHairTips, tip * (1.0 - root));
      float highlight = (0.18 + 0.49 * smoothstep(-0.56, 1.05, grain)) * avenskyHairMix.x * (1.0 - root * 0.66);
      pigment = mix(pigment, avenskyHairHighlights, highlight);
      // Give close midtones more separation without restoring baked color bands.
      float strandContrast = grain / (1.0 + 0.41 * abs(grain));
      sampledDiffuseColor.rgb = mix(pigment * (1.0 + 0.31 * strandContrast), sampledDiffuseColor.rgb, avenskyHairOriginal);
      diffuseColor *= sampledDiffuseColor;
    `));
  };
  material.needsUpdate = true;
  return setPalette;
}
