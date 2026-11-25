import { useEffect, useLayoutEffect, useMemo } from "react";
import { Environment, Lightformer } from "@react-three/drei";
import { createPortal, useThree } from "@react-three/fiber";
import { BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, TorusGeometry, Vector3, type BufferGeometry } from "three";
import { selectedGarageTheme } from "../../theme/catalog";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { applyGarageLighting, SELECTION_CRIMSON, tagGarageAccent } from "../../theme/garageLighting";
import { GarageFloorReflection } from "./GarageFloorReflection";
import { GarageGlow } from "./GarageGlow";
import { DEFAULT_PREVIEW_PLATFORM } from "./previewPlacement";
import { isCompactPreview } from "./previewBudget";
const origin = new Vector3();

function createDisplayPlatform(center: Vector3, floorY: number, radius: number) {
  const platform = new Group();
  platform.name = "garage-display-platform";
  const stageMaterials: MeshStandardMaterial[] = [];
  const stageGeometries: BufferGeometry[] = [];
  const diskGeometry = new CylinderGeometry(radius, radius, 0.06, 72);
  const diskMaterial = new MeshStandardMaterial({
    color: "#332c26", metalness: 0.72, roughness: 0.28,
    envMapIntensity: 0.85,
  });
  stageGeometries.push(diskGeometry);
  stageMaterials.push(diskMaterial);
  const disk = new Mesh(diskGeometry, diskMaterial);
  disk.name = "heroes-circular-garage-platform";
  disk.position.set(center.x, floorY - 0.03 + 0.005, center.z);
  disk.receiveShadow = true;
  platform.add(disk);
  const addRing = (ringRadius: number, tube: number, color: string, emissiveIntensity: number, themed = false) => {
    const geometry = new TorusGeometry(ringRadius, tube, 8, 96);
    const material = new MeshStandardMaterial({
      color: themed ? "#211b16" : color,
      emissive: themed ? "#ffffff" : color,
      emissiveIntensity,
      metalness: 0.24,
      roughness: 0.3,
    });
    if (themed) tagGarageAccent(material);
    stageGeometries.push(geometry);
    stageMaterials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(center.x, floorY + 0.012, center.z);
    mesh.name = themed ? "garage-platform-theme-light" : "garage-platform-mixed-light";
    platform.add(mesh);
  };
  addRing(radius * 0.94, 0.035, "#e9b579", 0.55, true);
  addRing(radius * 0.84, 0.018, "#ffad43", 0.28);
  addRing(radius * 0.99, 0.009, "#6a635b", 0.18);

  // Machined dark outer lip with spaced, low-output marker lights instead of
  // a continuous bright halo. Instancing keeps the extra stage detail cheap.
  const rimGeometry = new TorusGeometry(radius * 0.976, 0.038, 8, 96);
  const rimMaterial = new MeshStandardMaterial({ color: "#38302b", metalness: 0.88, roughness: 0.24 });
  stageGeometries.push(rimGeometry);
  stageMaterials.push(rimMaterial);
  const rim = new Mesh(rimGeometry, rimMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(center.x, floorY + 0.006, center.z);
  rim.name = "garage-platform-machined-outer-rim";
  platform.add(rim);

  const markerGeometry = new BoxGeometry(0.09, 0.014, 0.026);
  const markerMaterial = new MeshStandardMaterial({
    color: "#f1d7af", emissive: "#775537", emissiveIntensity: 0.5,
    metalness: 0.35, roughness: 0.28,
  });
  const markers = new InstancedMesh(markerGeometry, markerMaterial, 48);
  const marker = new Object3D();
  for (let index = 0; index < 48; index += 1) {
    const angle = (index / 48) * Math.PI * 2;
    const markerRadius = radius * 0.978;
    marker.position.set(
      center.x + Math.cos(angle) * markerRadius,
      floorY + 0.027,
      center.z + Math.sin(angle) * markerRadius,
    );
    marker.rotation.set(0, -angle, 0);
    marker.updateMatrix();
    markers.setMatrixAt(index, marker.matrix);
    markers.setColorAt(index, new Color(index % 8 === 0 ? "#d98d3b" : "#e8d1af"));
  }
  markers.instanceMatrix.needsUpdate = true;
  if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
  markers.name = "garage-platform-dotted-edge-lights";
  stageGeometries.push(markerGeometry);
  stageMaterials.push(markerMaterial);
  platform.add(markers);
  return { platform, dispose() {
    stageGeometries.forEach(geometry => geometry.dispose());
    stageMaterials.forEach(material => material.dispose());
    markers.dispose();
  } };
}

// Actors and the optional turntable share the authored garage scene and its active camera.
export function VehiclePlatform({ turntable, selectionLighting, floorCaptureRate }: {
  turntable: Group;
  selectionLighting: boolean;
  floorCaptureRate?: number;
}) {
  const scene = useThree(state => state.scene);
  const invalidate = useThree(state => state.invalidate);
  const theme = usePreferencesStore(selectedGarageTheme);
  const contrast = usePreferencesStore(state => state.highContrast);
  const brightness = usePreferencesStore(state => state.garageEffects.accentBrightness);
  const floorReflection = usePreferencesStore(state => state.garageEffects.floorReflections && state.garageEffects.reflectionStrength > 0);
  const radius = DEFAULT_PREVIEW_PLATFORM[0] / 2;
  const stage = useMemo(() => createDisplayPlatform(origin, 0, radius), [radius]);
  useEffect(() => () => stage.dispose(), [stage]);
  useLayoutEffect(() => {
    applyGarageLighting(stage.platform, theme, contrast, brightness * .64,
      selectionLighting && theme === "scarlet" ? SELECTION_CRIMSON : null);
    invalidate();
  }, [stage, theme, contrast, brightness, selectionLighting, invalidate]);
  return <>
    {createPortal(<primitive object={stage.platform} dispose={null} />, turntable)}
    {floorReflection && createPortal(<GarageFloorReflection radius={radius} turntable={turntable} captureRate={floorCaptureRate} />, scene)}
  </>;
}

export function GarageEnvironment({ onSettled }: { onSettled: () => void }) {
  const compact = useThree(state => isCompactPreview(state.size.width));
  const reflections = usePreferencesStore(state => state.garageEffects.environmentReflections);
  useLayoutEffect(onSettled, [onSettled]);
  // Capture softboxes once. Opening another menu never loads a second room model or HDR image.
  const softboxes = useMemo(() => reflections && (
    <Environment resolution={compact ? 32 : 64} frames={1} background={false}>
      <Lightformer color="#fff1dd" intensity={1.2} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[4, 8, 1]} />
      <Lightformer color="#fff7eb" intensity={.8} position={[-6, 3, 0]} rotation={[0, Math.PI / 2, 0]} scale={[8, .6, 1]} />
      <Lightformer color="#f0c79a" intensity={.5} position={[0, 3, -6]} scale={[8, .5, 1]} />
    </Environment>
  ), [compact, reflections]);
  return <>
    <GarageGlow />
    {softboxes}
  </>;
}
