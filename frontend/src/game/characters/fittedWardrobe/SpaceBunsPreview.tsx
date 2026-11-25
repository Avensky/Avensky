import { Component, Suspense, useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Matrix4, MeshStandardMaterial, Quaternion, Skeleton, SkinnedMesh, Vector3, type Object3D, type WebGLRenderer } from "three";
import { useAssetGLTF } from "../../../assets/useAssetGLTF";
import { getWardrobeActorBody } from "../wardrobeBody";
import { hairOptions, useLocalHairstyle, type LocalHairOption } from "./LocalHairFeatures";
import { prepareHairDye } from "./hairDye";
import { useHairPaletteStore } from "./hairPalette";
import { prepareHairShoulderDepth } from "./HairShoulderDepth";

function waveClearance(material: MeshStandardMaterial, depth: ReturnType<typeof prepareHairShoulderDepth>) {
  const uniforms = {
    hairSway: {value:new Vector3()},
    hairShoulderL:{value:new Vector3()}, hairShoulderR:{value:new Vector3()},
    hairArmL:{value:new Vector3()}, hairArmR:{value:new Vector3()},
    hairNape:{value:new Vector3()}, hairBack:{value:new Vector3()},
    hairShoulderDepth: { value: depth.texture },
    hairShoulderTexel: { value: depth.texel },
    hairShoulderProjection: { value: new Matrix4() },
  };
  const before = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => cacheKey + "|space-bun-motion-v2";
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader = [
      "uniform vec3 hairSway,hairShoulderL,hairShoulderR,hairArmL,hairArmR,hairNape,hairBack;",
      "uniform sampler2D hairShoulderDepth;",
      "uniform float hairShoulderTexel;",
      "uniform mat4 hairShoulderProjection;",
      "#include <packing>",
      "vec3 clearHairBehind(vec3 p, vec3 a, vec3 b, float radius) {",
      "  vec3 axis = b-a;",
      "  vec3 center = a + axis * clamp(dot(p-a,axis)/max(dot(axis,axis),0.00001),0.0,1.0);",
      "  vec2 across = (p-center).xy;",
      "  float d = dot(across,across);",
      "  float weight = 1.0 - smoothstep(radius * radius * 0.76, radius * radius, d);",
      "  float edge = center.z - sqrt(max(radius * radius - d, 0.0)) - 0.007;",
      "  p.z = mix(p.z,min(p.z,edge),weight);",
      "  return p;",
      "}",
      "float hairDepthAt(vec2 uv) {",
      "  return unpackRGBAToDepth(texture2D(hairShoulderDepth,uv));",
      "}",
      "vec3 clearHairSurface(vec3 p) {",
      "  vec3 clip = (hairShoulderProjection * vec4(p,1.0)).xyz * 0.5 + 0.5;",
      "  if (any(lessThanEqual(clip,vec3(0.0))) || any(greaterThanEqual(clip,vec3(1.0)))) return p;",
      "  vec2 tap = vec2(hairShoulderTexel,0.0);",
      "  float surface = min(hairDepthAt(clip.xy),min(hairDepthAt(clip.xy-tap),hairDepthAt(clip.xy+tap)));",
      "  surface = min(surface,min(hairDepthAt(clip.xy-tap.yx),hairDepthAt(clip.xy+tap.yx)));",
      "  if (surface >= 0.999) return p;",
      "  float span = 2.0 / max(0.01,hairShoulderProjection[2].z);",
      "  p.z -= max(0.0,(clip.z-surface)*span+0.005);",
      "  return p;",
      "}",
      shader.vertexShader.replace("#include <skinning_vertex>",[
        "#include <skinning_vertex>",
        "float wave = (1.0-smoothstep(1.34,1.52,position.y)) * (1.0-smoothstep(-0.024,0.012,position.z));",
        "if(wave > 0.001) {",
        "  transformed += hairSway * wave;",
        "  vec3 cleared = clearHairBehind(transformed,hairNape,hairBack,0.088);",
        "  cleared = clearHairBehind(cleared,hairNape,hairShoulderL,0.061);",
        "  cleared = clearHairBehind(cleared,hairNape,hairShoulderR,0.061);",
        "  cleared = clearHairBehind(cleared,hairShoulderL,hairArmL,0.056);",
        "  cleared = clearHairBehind(cleared,hairShoulderR,hairArmR,0.056);",
        "  transformed = mix(transformed,cleared,smoothstep(0.02,0.62,wave));",
        "  transformed = mix(transformed,clearHairSurface(transformed),smoothstep(0.001,0.055,wave));",
        "}",
      ].join("\n")),
    ].join("\n");
  };
  material.needsUpdate = true;
  return uniforms;
}

function softenRoots(material: MeshStandardMaterial) {
  if (!/Scalp roots|Hairline wisps/.test(material.name)) return;
  const before=material.onBeforeCompile;
  const key=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>key+"|soft-hairline";
  material.onBeforeCompile=(shader,renderer)=>{
    before.call(material,shader,renderer);
    // Keep the original root color, but let the weakest cards fade into the skin.
    shader.fragmentShader=shader.fragmentShader.replace("#include <alphatest_fragment>",
      "diffuseColor.a *= smoothstep(0.09, 0.66, diffuseColor.a);\n#include <alphatest_fragment>");
  };
}

function blendFringeLighting(material: MeshStandardMaterial) {
  if (!/Main cards|Fringe cards|Back cards|Root strands|Scalp roots|Hairline wisps/.test(material.name)) return;
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + "|fringe-lighting";
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const varying = "varying vec3 fringeSurfaceNormal;\n";
    shader.vertexShader = varying + shader.vertexShader.replace("#include <skinnormal_vertex>", `
      #include <skinnormal_vertex>
      // Give overlapping cards one outward lighting direction at the join.
      vec3 fringeNormal = (position - vec3(0.0, 1.569, 0.012)) / vec3(0.0064, 0.0106, 0.0119);
      #ifdef USE_SKINNING
        fringeNormal = mat3(skinMatrix) * fringeNormal;
      #endif
      fringeSurfaceNormal = normalize(normalMatrix * fringeNormal);
    `);
    shader.fragmentShader = varying + shader.fragmentShader.replace("#include <normal_fragment_maps>", `
      #include <normal_fragment_maps>
      vec3 fromScalp = vAvenskyHairRest - vec3(0.0, 1.569, 0.012);
      float elevation = normalize(fromScalp).y;
      float seam = smoothstep(0.46, 0.58, elevation) * (1.0 - smoothstep(0.72, 0.82, elevation));
      seam *= smoothstep(0.025, 0.050, fromScalp.z) * (1.0 - smoothstep(0.050, 0.073, abs(fromScalp.x)));
      normal = normalize(mix(normal, normalize(fringeSurfaceNormal), 0.43 * seam));
    `);
  };
}

function FittedHair({ root, style }: { root: Object3D; style: LocalHairOption }) {
  const { scene } = useAssetGLTF(style.url);
  const frame = useRef<((delta: number, renderer: WebGLRenderer) => void) | undefined>(undefined);

  useLayoutEffect(() => {
    const actor = getWardrobeActorBody(root);
    // Imported hair catalog IDs (hair-01) differ from GLB mesh names (Hair_01).
    const hair = scene.getObjectByName(style.mesh ?? style.id);
    const head = root.getObjectByName("head");
    if (!actor || !hair || !head) return;
    const parts: SkinnedMesh[] = [];
    hair.traverse(part => { if (part instanceof SkinnedMesh) parts.push(part); });
    const bonesByName = new Map(actor.skeleton.bones.map((bone, i) => [bone.name, {bone, inverse:actor.skeleton.boneInverses[i]}]));
    const bindings = parts.map(part => part.skeleton.bones.map((bone,i)=>{
      const match = bonesByName.get(bone.name);
      return match?.inverse.elements.every((n,j)=>Math.abs(n-part.skeleton.boneInverses[i].elements[j])<.0001) ? match.bone : undefined;
    }));
    if (!parts.length || bindings.some(matched=>matched.length!==actor.skeleton.bones.length || matched.some(bone=>!bone))) return;

    const group = new Group();
    group.name = "fitted-local-hairstyle";
    const materials: MeshStandardMaterial[] = [];
    const skeletons: Skeleton[] = [];
    const dyes: ReturnType<typeof prepareHairDye>[]=[];
    const motions: {mesh:SkinnedMesh; uniforms:ReturnType<typeof waveClearance>}[]=[];
    const contact = style.id === "Space_Buns" ? prepareHairShoulderDepth(root) : undefined;
    parts.forEach((part,i) => {
      // Let the character's own scalp show through the hair part.
      if (part.material instanceof MeshStandardMaterial && part.material.name.endsWith("Crown backing")) return;
      const skinned = part.clone(false);
      const skin = new Skeleton(bindings[i].filter(bone=>bone!==undefined),part.skeleton.boneInverses);
      skeletons.push(skin);
      skinned.bind(skin, part.bindMatrix);
      skinned.frustumCulled = false;
      if (part.material instanceof MeshStandardMaterial) {
        const material=part.material.clone();
        materials.push(material);
        dyes.push(prepareHairDye(material,part.geometry,style.id.startsWith("Curly_")));
        softenRoots(material);
        if (contact) {
          blendFringeLighting(material);
          const bounds = part.geometry.boundingBox;
          if (bounds && bounds.min.y < 1.52 && bounds.min.z < .012) {
            motions.push({mesh:skinned,uniforms:waveClearance(material, contact)});
          }
        }
        skinned.material=material;
      }
      group.add(skinned);
    });
    const original = ["HAIR_HAIR20", "villager-short-hair"].flatMap(name => {
      const part = root.getObjectByName(name);
      return part ? [{part, visible:part.visible}] : [];
    });
    root.add(group);
    for (const {part} of original) part.visible = false;
    const setColor=()=>{
      const {palette,original}=useHairPaletteStore.getState();
      dyes.forEach(dye=>dye(palette,original));
    };
    setColor();
    const stop=useHairPaletteStore.subscribe(setColor);
    const forward=new Vector3(), oldForward=new Vector3(), kick=new Vector3(), sway=new Vector3();
    const swayVelocity = new Vector3(), springOffset = new Vector3(), springStep = new Vector3();
    const rotation=new Quaternion(), headRotation=new Quaternion();
    const points = {
      hairNape:root.getObjectByName("neck_01"), hairBack:root.getObjectByName("spine_04"),
      hairShoulderL:root.getObjectByName("upperarm_l"), hairShoulderR:root.getObjectByName("upperarm_r"),
      hairArmL:root.getObjectByName("upperarm_twist_01_l"), hairArmR:root.getObjectByName("upperarm_twist_01_r"),
    };
    let firstFrame=true;
    frame.current=(delta, renderer)=>{
      for (const {part} of original) part.visible=false;
      if (!contact || !motions.length) return;
      root.updateWorldMatrix(true, false);
      root.updateMatrixWorld(true);
      contact.sample(renderer);
      root.getWorldQuaternion(rotation).invert();
      head.getWorldQuaternion(headRotation).premultiply(rotation);
      forward.set(0,0,1).applyQuaternion(headRotation);
      if(firstFrame){oldForward.copy(forward);firstFrame=false;}
      const dt = Math.min(delta, .08);
      const damp = 1 - Math.exp(-12 * dt);
      kick.copy(oldForward).sub(forward).multiplyScalar(.16).clampLength(0,.022);
      // A critically damped spring lets the ends follow the turn and settle.
      const springRate = 19;
      const decay = Math.exp(-springRate * dt);
      springOffset.copy(sway).sub(kick);
      springStep.copy(swayVelocity).addScaledVector(springOffset, springRate);
      sway.copy(springOffset).addScaledVector(springStep, dt).multiplyScalar(decay).add(kick);
      swayVelocity.addScaledVector(springStep, -springRate * dt).multiplyScalar(decay);
      oldForward.lerp(forward,damp);
      for(const {mesh,uniforms} of motions){
        uniforms.hairSway.value.copy(sway);
        uniforms.hairShoulderProjection.value.multiplyMatrices(contact.projection, mesh.matrixWorld);
        for(const key of Object.keys(points) as (keyof typeof points)[]){
          const joint=points[key];
          if(joint)mesh.worldToLocal(joint.getWorldPosition(uniforms[key].value));
        }
      }
    };
    return () => {
      frame.current=undefined;
      stop();
      group.removeFromParent();
      for (const {part, visible} of original) part.visible = visible;
      materials.forEach(material=>material.dispose());
      skeletons.forEach(skeleton=>skeleton.dispose());
      contact?.dispose();
    };
  }, [root, scene, style]);

  useFrame(({gl},delta)=>frame.current?.(delta,gl),0);
  return null;
}

class HairLoadBoundary extends Component<{root:Object3D;style:LocalHairOption}, {failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    return this.state.failed ? null : <Suspense fallback={null}><FittedHair root={this.props.root} style={this.props.style} /></Suspense>;
  }
}

export function SpaceBunsPreview({root, active}: {root:Object3D; active:boolean}) {
  const styleId=useLocalHairstyle(state=>state.id);
  const style=hairOptions.find(option=>option.id===styleId);
  return active && style ? <HairLoadBoundary key={root.uuid+style.id} root={root} style={style} /> : null;
}
