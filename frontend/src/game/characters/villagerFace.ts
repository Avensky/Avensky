import { Color, Float32BufferAttribute, MathUtils, SkinnedMesh, Vector2, Vector4, type BufferGeometry, type MeshStandardMaterial, type Object3D } from "three";
import type { CharacterLook } from "./characterCatalog";

const FACE_SHAPES = ["smile", "brow", "blink"] as const;
const VESPER_SOFT_CONTOUR = "vesper-soft-contour";
type FaceShape = typeof FACE_SHAPES[number] | typeof VESPER_SOFT_CONTOUR;

const softBand = (distance: number, inner: number, outer: number) => 1 - MathUtils.smoothstep(distance, inner, outer);
export const VILLAGER_EYES = {
  female: { x: .0275, y: 1.5583, z: .0895, radius: .006, lip: 1.501 },
  male: { x: .0282, y: 1.7219, z: .1105, radius: .0066, lip: 1.648 },
};
const faceMesh = (root: Object3D) => root.getObjectByName("HEAD_FACE4") ?? root.getObjectByName("HEAD_WARRIOR");

/** Use bind-pose position so color follows the skinned eyes and brows. */
export function prepareVillagerFaceColors(materials: Iterable<MeshStandardMaterial>, female: boolean) {
  const fit = VILLAGER_EYES[female ? "female" : "male"];
  const irisColor = { value: new Color() };
  const irisDarkness = { value: 0 };
  const browColor = { value: new Color() };
  const browStrength = { value: 0 };
  const shadowPigment = { value: new Color() };
  const shadowStrength = { value: 0 };
  const linerStyle = { value: 0 };
  // Upper-lid boundaries measured on each rig's authored face, in bind-space meters.
  const lidShape = { value: new Vector4(fit.x + .0015, fit.y + (female ? -.0009 : -.0042), .0142, female ? .0054 : .0058) };
  const lipPigment = { value: new Color() };
  const lipStrength = { value: 0 };
  // Mouth seam height, half-width, upper and lower lip heights in the authored bind pose.
  const lipShape = { value: female ? new Vector4(1.4992, .0210, .0085, .0098) : new Vector4(1.6518, .0245, .0098, .0086) };
  const corneas: { material: MeshStandardMaterial; opacity: number; env: number }[] = [];
  for (const material of materials) {
    if (material.name === "MAT_Cornea") {
      corneas.push({ material, opacity: material.opacity, env: material.envMapIntensity });
    }
    if (material.name === "MAT_SkinFace") {
      material.customProgramCacheKey = () => "villager-face-makeup-v2";
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, { shadowPigment, shadowStrength, linerStyle, lidShape, lipPigment, lipStrength, lipShape, lipFront: { value: fit.z - .015 } });
        shader.vertexShader = "varying vec3 vLipBind;\n" + shader.vertexShader.replace(
          "#include <begin_vertex>", "#include <begin_vertex>\nvLipBind = position;",
        );
        shader.fragmentShader = `varying vec3 vLipBind;
          uniform vec3 lipPigment, shadowPigment;
          uniform float shadowStrength, linerStyle;
          uniform vec4 lidShape;
          uniform float lipStrength, lipFront;
          uniform vec4 lipShape;
        ` + shader.fragmentShader.replace("#include <map_fragment>", `
          #include <map_fragment>
          if ((shadowStrength > 0.0 || linerStyle > 0.0) && vLipBind.z > lipFront - 0.023) {
            float u = (abs(vLipBind.x) - lidShape.x) / lidShape.z;
            float y = vLipBind.y - lidShape.y;
            float arch = max(0.0, 1.0 - u * u);
            float lineY = lidShape.w * arch + 0.0021 * u;
            float lid = y - lineY;
            float fade = 1.0 - smoothstep(0.83, 1.22, abs(u));
            float shadow = smoothstep(-0.0015, 0.001, lid)
                         * (1.0 - smoothstep(0.0025, 0.012, lid)) * fade;
            float detail = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            diffuseColor.rgb = mix(diffuseColor.rgb, shadowPigment * (0.48 + sqrt(detail)), shadow * shadowStrength);
            if (linerStyle > 0.0) {
              float outerLid = smoothstep(-0.85, 0.60, u);
              float thickness = 0.0011 + 0.0010 * outerLid;
              // Cat eye starts on the lid, so its silhouette still reads under a fringe.
              if (linerStyle >= 2.0) thickness += 0.0028 * outerLid;
              float upper = (1.0 - smoothstep(thickness * 0.45, thickness, abs(lid - thickness * 0.45))) * fade;
              float wing = 0.0;
              if (linerStyle >= 2.0) {
                float t = clamp((u - 0.78) / 0.86, 0.0, 1.0);
                float outer = smoothstep(0.72, 0.94, u) * (1.0 - smoothstep(1.52, 1.66, u));
                float sweep = 0.0038 + 0.0044 * t * t;
                wing = (1.0 - smoothstep(0.0004, 0.0024 - 0.0016 * t, abs(y - sweep))) * outer;
                if (linerStyle > 2.0) {
                  // Extend the lower lash into a second flick below the upper wing.
                  // The exposed lid keeps the two strokes legible beneath the stock fringe.
                  float lowerLid = -0.0050 * arch + 0.0016 * u;
                  float lowerFlick = mix(lowerLid, 0.0016 + 0.0024 * t, smoothstep(0.85, 1.04, u));
                  float stroke = 1.0 - smoothstep(0.00095, 0.0021, abs(y - lowerFlick));
                  float taper = smoothstep(-0.34, 0.35, u) * (1.0 - smoothstep(1.50, 1.68, u));
                  wing = max(wing, stroke * taper);
                }
              }
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.010, 0.006, 0.010), 0.92 * max(upper, wing));
            }
          }
          if (lipStrength > 0.0 && vLipBind.z > lipFront) {
            float side = abs(vLipBind.x) / lipShape.y;
            float seam = vLipBind.y - lipShape.x;
            float height = seam > 0.0 ? lipShape.z : lipShape.w;
            // Taper both lips into the corners and leave a small cupid's bow.
            float taper = max(0.0, 1.0 - side * side);
            float bow = seam > 0.0 ? 0.12 * (1.0 - smoothstep(0.0, 0.24, side)) : 0.0;
            float edge = height * taper * (1.0 - bow) - abs(seam);
            float lipMask = smoothstep(-0.0008, 0.0012, edge) * (1.0 - smoothstep(0.90, 1.04, side));
            float detail = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            diffuseColor.rgb = mix(diffuseColor.rgb, lipPigment * (0.25 + 1.7 * sqrt(detail)), lipMask * lipStrength);
          }
        `);
      };
      continue;
    }
    const iris = material.name === (female ? "MAT_Details" : "MAT_Eyes");
    if (!iris && material.name !== "MAT_LashBrow") continue;
    material.customProgramCacheKey = () => iris ? "villager-iris" : "villager-brow";
    material.onBeforeCompile = shader => {
      shader.uniforms.faceTint = iris ? irisColor : browColor;
      shader.uniforms.eyeCenter = { value: new Vector2(fit.x, fit.y) };
      shader.uniforms.irisRadius = { value: fit.radius };
      shader.uniforms.irisDarkness = irisDarkness;
      shader.uniforms.browStrength = browStrength;
      shader.vertexShader = "varying vec3 vFaceBind;\n" + shader.vertexShader.replace(
        "#include <begin_vertex>", "#include <begin_vertex>\nvFaceBind = position;",
      );
      shader.fragmentShader = `varying vec3 vFaceBind;
        uniform vec3 faceTint;
        uniform vec2 eyeCenter;
        uniform float irisRadius;
        uniform float irisDarkness;
        uniform float browStrength;
        ` + shader.fragmentShader.replace("#include <map_fragment>", iris ? `
          #include <map_fragment>
          vec2 eye = (vec2(abs(vFaceBind.x), vFaceBind.y) - eyeCenter) / irisRadius;
          float radial = length(eye);
          float streak = sin(atan(eye.y, eye.x + 0.00001) * 31.0 + radial * 14.0);
          vec3 pigment = faceTint * (0.78 + 0.14 * streak);
          pigment *= 1.0 - 0.73 * smoothstep(0.78, 1.0, radial);
          pigment = mix(vec3(0.0015), pigment, smoothstep(0.36, 0.44, radial));
          float irisMask = 1.0 - smoothstep(0.95, 1.06, radial);
          diffuseColor.rgb = mix(diffuseColor.rgb, pigment, irisMask);
        ` : `
          #include <map_fragment>
          float brow = smoothstep(eyeCenter.y + 0.009, eyeCenter.y + 0.014, vFaceBind.y) * browStrength;
          float detail = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, faceTint * (0.64 + 0.54 * detail), brow);
        `);
      if (iris) shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
        // Cap highlights inside dark irises while preserving the whites and lids.
        vec3 darkIris = min(outgoingLight, faceTint * 1.8 + vec3(0.003));
        outgoingLight = mix(outgoingLight, darkIris, irisMask * irisDarkness);
        #include <opaque_fragment>
      `);
    };
  }
  return (look: CharacterLook) => {
    shadowStrength.value = look.eyeshadow ? .75 : 0;
    if (look.eyeshadow) shadowPigment.value.set(look.eyeshadow);
    const liner = look.appearance.eyeliner;
    linerStyle.value = liner === "graphic" ? 3 : liner === "cat-eye" ? 2 : liner === "classic" ? 1 : 0;
    lipStrength.value = look.lipstick ? .84 : 0;
    if (look.lipstick) lipPigment.value.set(look.lipstick);
    irisColor.value.set(look.iris);
    const { r, g, b } = irisColor.value;
    irisDarkness.value = 1 - MathUtils.smoothstep(.2126 * r + .7152 * g + .0722 * b, .045, .145);
    for (const { material, opacity, env } of corneas) {
      material.opacity = opacity * MathUtils.lerp(1, .13, irisDarkness.value);
      material.envMapIntensity = env * MathUtils.lerp(1, .15, irisDarkness.value);
    }
    browStrength.value = look.brow ? 1 : 0;
    if (look.brow) browColor.value.set(look.brow);
  };
}

/** Masks follow the two villagers' bind-pose coordinates in meters. */
export function addVillagerFaceShapes(root: Object3D, female = true, animate = true) {
  const fit = VILLAGER_EYES[female ? "female" : "male"];
  const owned: BufferGeometry[] = [];
  faceMesh(root)?.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material)) return;
    const material = mesh.material.name;
    const skin = material === "MAT_SkinFace";
    const lash = material === "MAT_LashBrow";
    const eye = material === "MAT_Cornea" || material === "MAT_Eyes";
    const details = material === "MAT_Details";
    const alternative = female && skin;
    const positions = mesh.geometry.getAttribute("position");
    if (!positions || !(skin || lash || eye || details) || mesh.geometry.morphAttributes.position?.length) return;
    if (!animate && !alternative) return;

    const smile = new Float32Array(positions.count * 3);
    const brow = new Float32Array(positions.count * 3);
    const blink = new Float32Array(positions.count * 3);
    const contour = alternative ? new Float32Array(positions.count * 3) : undefined;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const side = Math.abs(x), offset = i * 3;
      if (contour) {
        const forward = MathUtils.smoothstep(z, .046, .078);
        const jaw = softBand(Math.abs(y - 1.487), .007, .024) * softBand(Math.abs(side - .047), .013, .029)
          * MathUtils.smoothstep(z, .025, .054);
        const cheek = softBand(Math.abs(y - 1.532), .003, .017) * softBand(Math.abs(side - .049), .005, .018) * forward;
        const nose = softBand(Math.abs(y - 1.533), .004, .017) * softBand(side, .006, .019) * MathUtils.smoothstep(z, .087, .106);
        const chin = softBand(Math.abs(y - 1.478), .004, .014) * softBand(side, .009, .028) * forward;
        contour[offset] = Math.sign(x) * (.0062 * cheek + .0015 * jaw) - .10 * x * nose;
        contour[offset + 1] = .0015 * cheek - .0008 * chin;
        contour[offset + 2] = .004 * cheek - .0055 * nose + .0025 * chin;
      }
      if (!animate) continue;
      const front = MathUtils.smoothstep(z, fit.z - .024, fit.z - .005);
      const eyeWidth = softBand(Math.abs(side - fit.x), .011, .027);
      if (skin || details) {
        const lip = softBand(Math.abs(y - fit.lip), .006, .021) * softBand(side, .023, .045) * front;
        const corner = MathUtils.smoothstep(side, .004, .024) * lip;
        smile[offset] = Math.sign(x) * (.0032 * lip);
        smile[offset + 1] = .009 * corner - .001 * lip;
      }
      if (skin || lash) {
        const eyebrow = MathUtils.smoothstep(y, fit.y + .005, fit.y + .017)
          * softBand(Math.abs(y - fit.y - .017), .005, .026);
        brow[offset + 1] = .008 * eyebrow * eyeWidth * front;
      }
      const eyeball = eye || (details && y > fit.y - .018);
      const lid = eyeWidth * softBand(Math.abs(y - fit.y + .003), .012, .024) * front;
      if (eyeball || skin || lash) {
        const close = eyeball ? .94 : lid * (lash ? softBand(Math.abs(y - fit.y + .006), .011, .021) : 1);
        blink[offset + 1] = (fit.y - .005 + .07 * (side - fit.x) - y) * close;
        if (eyeball) blink[offset + 2] = -.0025;
      }
    }

    const geometry = mesh.geometry.clone();
    geometry.morphTargetsRelative = true;
    const shapeNames = [...(animate ? FACE_SHAPES : []), ...(contour ? [VESPER_SOFT_CONTOUR] : [])];
    const offsets = [...(animate ? [smile, brow, blink] : []), ...(contour ? [contour] : [])];
    geometry.morphAttributes.position = offsets.map((offsets, i) => {
      const attribute = new Float32BufferAttribute(offsets, 3);
      attribute.name = shapeNames[i];
      return attribute;
    });
    mesh.geometry = geometry;
    mesh.updateMorphTargets();
    owned.push(geometry);
  });
  return owned;
}

export function prepareVillagerFaceLook(root: Object3D) {
  const targets = driverFaceTargets(root, VESPER_SOFT_CONTOUR);
  return (shape: string | undefined) => {
    for (const { mesh, index } of targets) mesh.morphTargetInfluences![index] = shape === VESPER_SOFT_CONTOUR ? 1 : 0;
  };
}

export function driverFaceTargets(root: Object3D, shape: FaceShape) {
  const targets: { mesh: SkinnedMesh; index: number }[] = [];
  faceMesh(root)?.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh)) return;
    const index = mesh.morphTargetDictionary?.[shape];
    if (index !== undefined && mesh.morphTargetInfluences) targets.push({ mesh, index });
  });
  return targets;
}
