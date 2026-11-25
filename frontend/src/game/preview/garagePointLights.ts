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

export function prepareGaragePointLights(room: Object3D) {
  const materials = new Set<MeshStandardMaterial>();
  room.traverseVisible(node => {
    if (!(node instanceof Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material instanceof MeshStandardMaterial) materials.add(material);
    }
  });
  for (const material of materials) {
    const prepare = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      prepare.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>", garageLighting);
    };
    material.customProgramCacheKey = () => key + "|garage-point-lights";
  }
}
