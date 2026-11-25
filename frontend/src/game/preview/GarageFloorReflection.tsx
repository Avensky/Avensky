import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  LinearMipmapLinearFilter,
  CircleGeometry,
  ShaderMaterial,
  UniformsLib,
  type Group,
} from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { isCompactPreview } from "./previewBudget";
import {
  configureGarageFloor,
  gateGarageFloorCapture,
} from "./garageFloorEffects";

// The planar capture is limited to the rotating vehicle pad.
const floorShader = {
  name: "GaragePlatformReflection",
  uniforms: {
    ...UniformsLib.fog,
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    platformRadius: { value: 0 },
    platformAngle: { value: 0 },
    reflectionStrength: { value: 1 },
    reflectionBlur: { value: 0.25 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vReflection;
    varying vec2 vFloor;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vReflection = textureMatrix * vec4(position, 1.0);
      vFloor = (modelMatrix * vec4(position, 1.0)).xz;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float platformRadius;
    uniform float platformAngle;
    uniform float reflectionStrength;
    uniform float reflectionBlur;
    varying vec4 vReflection;
    varying vec2 vFloor;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      vec2 uv = vReflection.xy / vReflection.w;
      float c = cos(platformAngle), s = sin(platformAngle);
      vec2 local = vec2(c * vFloor.x - s * vFloor.y, s * vFloor.x + c * vFloor.y);
      vec3 reflection = texture2D(tDiffuse, uv, reflectionBlur * 2.0).rgb * reflectionStrength;
      vec3 padColor = vec3(0.005, 0.005, 0.006) + reflection * 0.75;
      // Circular perimeter with alternating theme, amber and cool-white cues.
      float edgeDistance = platformRadius - length(local);
      float rimAA = max(fwidth(edgeDistance), 0.004);
      float rim = 1.0 - smoothstep(0.018 - rimAA, 0.018 + rimAA, abs(edgeDistance));
      float sector = mod(floor((atan(local.y, local.x) + 3.1415926) * 12.0 / 6.2831852), 3.0);
      vec3 rimColor = sector < 1.0 ? vec3(0.74, 0.54, 0.32) : sector < 2.0 ? vec3(0.92, 0.48, 0.08) : vec3(0.82, 0.74, 0.64);
      padColor = mix(padColor, padColor * 0.55 + rimColor * 0.45, rim);
      gl_FragColor = vec4(padColor, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `,
};

export function GarageFloorReflection({
  radius,
  turntable,
  captureRate,
}: {
  radius: number;
  turntable: Group;
  captureRate?: number;
}) {
  const settings = usePreferencesStore((s) => s.garageEffects);
  const getScene = useThree(s => s.get);
  const compact = useThree(s => isCompactPreview(s.size.width));
  const floorRef = useRef<Reflector>(null);
  const floor = useMemo(() => {
    // The garage floor is already in the cached frame. Only the display disk reflects the actor.
    const object = new Reflector(new CircleGeometry(radius, 72), {
      // A positive clip bias admitted the opaque pad below the mirror into the
      // capture, hiding the vehicle/ceiling behind its underside. The mirror is
      // already raised above the disk; clip exactly there to keep that underlay excluded.
      shader: floorShader,
      textureWidth: compact ? 256 : 512,
      textureHeight: compact ? 256 : 512,
      multisample: 0,
      clipBias: 0,
    });
    object.name = "garage-floor-reflection";
    object.rotation.x = -Math.PI / 2;
    object.position.y = 0.007;
    const material = object.material as ShaderMaterial;
    material.fog = true;
    // Keep the overlay ahead of the source pad's nearly coplanar triangles.
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
    // Filter small reflected lights at grazing angles, rather than letting
    // single subpixel highlights flash between full brightness and black.
    const texture = object.getRenderTarget().texture;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    material.uniforms.platformRadius.value = radius;
    return object;
  }, [radius, compact]);
  const captureInterval = 1 / (captureRate ?? (compact ? 15 : 24));
  useLayoutEffect(() => {
    // Change the capture cadence without replacing the existing reflection texture.
    const capture = floor.onBeforeRender;
    gateGarageFloorCapture(floor, () => usePreferencesStore.getState().reducedMotion
      ? undefined : getScene().clock.elapsedTime, captureInterval);
    return () => { floor.onBeforeRender = capture; };
  }, [floor, getScene, captureInterval]);
  useLayoutEffect(() => {
    configureGarageFloor(floor, settings);
  }, [floor, settings]);
  useFrame(() => {
    const material = floorRef.current?.material as ShaderMaterial | undefined;
    if (material) {
      material.uniforms.platformAngle.value = turntable.rotation.y;
    }
  });
  useEffect(
    () => () => {
      floor.dispose();
      floor.geometry.dispose();
    },
    [floor],
  );
  return <primitive ref={floorRef} object={floor} dispose={null} />;
}
