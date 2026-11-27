import type { MeshStandardMaterial } from "three";

// The garage environment probe only contains its fixtures. Give painted
// surfaces a little warm reflected light, retaining each instance's tint.
export const garagePaintedFinish: MeshStandardMaterial["onBeforeCompile"] = shader => {
  shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
    #include <emissivemap_fragment>
    totalEmissiveRadiance += diffuseColor.rgb * vec3(.31, .28, .24);
  `);
};
