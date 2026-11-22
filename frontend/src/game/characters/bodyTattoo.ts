import { MeshStandardMaterial, Vector3, type SkinnedMesh } from "three";

export function prepareBodyTattoo(body?: SkinnedMesh | null) {
  if (!body) return undefined;
  const skin = (Array.isArray(body.material) ? body.material : [body.material])
    .filter(material => material instanceof MeshStandardMaterial && material.name === "MAT_SkinBody");
  const skeleton = body.skeleton;
  const shoulder = skeleton.bones.findIndex(bone => bone.name === "upperarm_l");
  const elbow = skeleton.bones.findIndex(bone => bone.name === "lowerarm_l");
  if (!skin.length || shoulder < 0 || elbow < 0) return undefined;
  const meshFromBind = body.bindMatrix.clone().invert();
  const joint = (index: number) => new Vector3()
    .setFromMatrixPosition(skeleton.boneInverses[index].clone().invert()).applyMatrix4(meshFromBind);
  const start = joint(shoulder);
  const axis = joint(elbow).sub(start);
  const length = axis.length();
  if (length < 1e-5) return undefined;
  axis.divideScalar(length);

  const enabled = { value: 0 };
  for (const material of skin) {
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.customProgramCacheKey = () => key + ":upper-arm-tattoo";
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.tattooEnabled = enabled;
      shader.uniforms.tattooStart = { value: start };
      shader.uniforms.tattooAxis = { value: axis };
      shader.uniforms.tattooLength = { value: length };
      shader.vertexShader = "varying vec3 tattooBindPosition;\n" + shader.vertexShader.replace(
        "#include <begin_vertex>", "#include <begin_vertex>\ntattooBindPosition = position;");
      shader.fragmentShader = `varying vec3 tattooBindPosition;
        uniform float tattooEnabled;
        uniform vec3 tattooStart;
        uniform vec3 tattooAxis;
        uniform float tattooLength;
        ` + shader.fragmentShader.replace("#include <color_fragment>", `
        #include <color_fragment>
        if (tattooEnabled > .5) {
          vec3 tattooOffset = tattooBindPosition - tattooStart;
          float tattooAlong = dot(tattooOffset, tattooAxis);
          float tattooT = tattooAlong / tattooLength;
          float tattooRadius = length(tattooOffset - tattooAxis * tattooAlong) / tattooLength;
          float tattooStripe = max(
            smoothstep(.39, .40, tattooT) - smoothstep(.45, .46, tattooT),
            smoothstep(.50, .51, tattooT) - smoothstep(.54, .55, tattooT)
          );
          float tattooInk = tattooStripe * (1.0 - smoothstep(.30, .38, tattooRadius));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.24, .28, .30), tattooInk);
        }
      `);
    };
    material.needsUpdate = true;
  }
  return (style?: string) => { enabled.value = style === "twin-band" ? 1 : 0; };
}
