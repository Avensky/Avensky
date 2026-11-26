import { Mesh, MeshStandardMaterial, ShaderChunk, type Object3D } from "three";

// Three's default path unrolls the BRDF once per point light, even where
// attenuation is already zero. The garage has dozens of short-range emitters.
// Keep the standard lighting equation and its shadow path for shadowed lights.
const pointLights = "#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )";
const garageLighting = ShaderChunk.lights_fragment_begin.replace(pointLights, `
  #if ( NUM_POINT_LIGHTS >= 8 ) && defined( RE_Direct ) && ( NUM_POINT_LIGHT_SHADOWS == 0 )
    for (int i = 0; i < NUM_POINT_LIGHTS; ++i) {
      PointLight lamp = pointLights[i];
      vec3 offset = lamp.position - geometryPosition;
      if (lamp.distance > 0.0 && dot(offset, offset) >= lamp.distance * lamp.distance) continue;
      getPointLightInfo(lamp, geometryPosition, directLight);
      RE_Direct(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    }
  #elif ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )`);

// The fixture-only probe has bright, narrow emitters surrounded by black. Give the
// subject a soft bounce from those same fixtures without lifting the room or creating lights.
const subjectLighting = `#include <lights_fragment_maps>
  #if defined( USE_ENVMAP ) && defined( RE_IndirectDiffuse )
    iblIrradiance *= 224.0;
  #endif
  #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
    radiance *= 24.0;
  #endif`;
const prepared = new WeakSet<MeshStandardMaterial>();

export function prepareGaragePointLights(room: Object3D, mode: "room" | "subject" = "room") {
  const materials = new Set<MeshStandardMaterial>();
  const collect = (node: Object3D) => {
    if (!(node instanceof Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material instanceof MeshStandardMaterial) materials.add(material);
    }
  };
  // Saved appearance edits can reveal initially hidden garments on the same actor.
  if (mode === "subject") room.traverse(collect);
  else room.traverseVisible(collect);
  for (const material of materials) {
    if (prepared.has(material)) continue;
    prepared.add(material);
    const prepare = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      prepare.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>", garageLighting);
      if (mode === "subject") shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_maps>", subjectLighting);
    };
    material.customProgramCacheKey = () => key + "|garage-point-lights-" + mode;
  }
}
