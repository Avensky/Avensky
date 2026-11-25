import { Material, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { isGarageWorkLight } from "./garageFixtures.ts";
import { fitMechanicsFloor } from "./mechanicsFloor.ts";
import { tagGarageAccent } from "../../theme/garageLighting.ts";

// Presentation edits from the source model's Sketchfab viewer are absent from
// its Blender GLB. Prepare owned fixtures for the selected theme; radiance and
// postprocessing have separate garage preferences. Values below are linear RGB.
// https://sketchfab.com/3d-models/garage-followers-special-71b1b4d569ec4c9788c76f4c3d56b461
export function prepareGarageDisplay(scene: Object3D) {
  const root = scene.clone(true);
  for (const child of [...root.children]) {
    const name = String(child.userData.name ?? child.name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (name === "lambotm") child.removeFromParent();
  }
  const materials = new Map<Material, Material>();
  const prepare = (source: Material) => {
    const existing = materials.get(source);
    if (existing) return existing;
    const material = source.clone();
    materials.set(source, material);
    if (!(material instanceof MeshStandardMaterial)) return material;
    material.envMapIntensity = 0.45;
    switch (material.name.trim()) {
      case "BLACK METAL":
        material.emissive.set(0);
        material.emissiveIntensity = 0;
        break;
      case "LIGHT":
        material.emissive.setRGB(0.02350918, 0.95040749, 0.00495542);
        // Native counter faces and the horizontal rack bars share this slot.
        // Bright cores lift both fixtures without adding a broad green light.
        material.emissiveIntensity = 1.2;
        break;
      case "SDC":
        material.color.setRGB(0.008, 0.08, 0.002);
        material.emissive.setRGB(0.01799614, 0.94552903, 0.00267312);
        material.emissiveIntensity = 2;
        break;
      case "BARR LTTRl":
      case "INOX":
        material.color.setRGB(0.7, 0.74, 0.8);
        material.metalness = 0.35;
        material.roughness = 0.22;
        material.envMapIntensity = 1;
        break;
      case "BASE":
      case "Material.004":
        material.color.setRGB(0.22, 0.24, 0.28);
        material.metalness = 0.25;
        material.roughness = 0.32;
        material.envMapIntensity = 0.9;
        break;
      case "Material.006":
        material.emissive.set("#fff1dc");
        material.emissiveIntensity = 3;
        break;
      case "Sol cubique":
        material.color.set("#3b332d");
        material.metalness = .42;
        material.roughness = .42;
        break;
      case "Sol_CAR":
        material.color.setRGB(0.008, 0.008, 0.009);
        material.metalness = 1;
        material.roughness = 0.2;
        break;
      case "Murs":
        material.userData.garageSurface = "garage-wall";
        material.metalness = .1;
        material.roughness = .78;
        break;
      case "Fond":
        material.userData.garageSurface = "garage-panel";
        material.color.setRGB(0.075, 0.08, 0.095);
        material.metalness = 0.12;
        material.roughness = 0.68;
        material.envMapIntensity = 1.1;
        break;
      case "Material.001":
        material.color.setRGB(0.006, 0.006, 0.007);
        material.roughness = 0.2;
        break;
      case "Haut":
        material.color.setRGB(0.025, 0.028, 0.035);
        material.metalness = 0.3;
        material.roughness = 0.4;
        material.envMapIntensity = 0.9;
        break;
    }
    const greenBase =
      material.color.g > 0.02 &&
      material.color.g > material.color.r * 2 &&
      material.color.g > material.color.b * 2;
    if (
      ["BLACK METAL", "LIGHT", "SDC", "PST"].includes(material.name.trim()) ||
      greenBase ||
      (material.emissive.g > 0.02 &&
        material.emissive.g > material.emissive.r * 2 &&
        material.emissive.g > material.emissive.b * 2)
    )
      tagGarageAccent(material, greenBase || material.name.trim() === "SDC");
    return material;
  };
  let workLight: MeshStandardMaterial | undefined;
  let rackLight: MeshStandardMaterial | undefined;
  root.traverse((object) => {
    // The authored four-corner fixture stays in the GLB; the rotating display
    // and its reflection probe omit it. Never hide or edit the cached source.
    if (String(object.userData.name ?? object.name) === "4*4")
      object.visible = false;
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(prepare)
      : prepare(object.material);
    if ((object.parent?.userData.name ?? object.parent?.name) === "Base_Light.001" &&
        object.material instanceof MeshStandardMaterial && object.material.name.trim() === "LIGHT") {
      if (!rackLight) {
        rackLight = object.material.clone();
        rackLight.userData.garageAccent = false;
        rackLight.color.set("#39332b");
        rackLight.emissive.set("#ffead5");
        rackLight.emissiveIntensity = 2.2;
      }
      object.material = rackLight;
    }
    // The freestanding twelve-cell work light shares the neon material in the
    // export. Give its bulbs a warm white phosphor so the bay retains neutral task lighting.
    if (isGarageWorkLight(object)) {
      if (!workLight) {
        workLight = object.material.clone();
        workLight.userData.garageAccent = false;
        workLight.emissive.set("#ffead5");
        workLight.emissiveIntensity = 2.2;
      }
      object.material = workLight;
    }
  });
  const disposeFloor = fitMechanicsFloor(root);
  // The front bank only contains 999. The rear bank contains complete zero
  // segments. Reuse one in the vacant first socket of the front bank.
  const zero = root.getObjectByName("Cube026");
  if (zero instanceof Mesh && root.getObjectByName("Cube024")) {
    root.updateWorldMatrix(true, true);
    const leading = zero.clone();
    leading.name = "garage-counter-leading-zero";
    const darkTube = new MeshStandardMaterial({ color: "#292520", emissiveIntensity: 0, roughness: .4, metalness: .25 });
    leading.material = darkTube;
    materials.set(darkTube, darkTube);
    leading.matrix.copy(root.matrixWorld).invert().multiply(zero.matrixWorld);
    leading.matrix.decompose(leading.position, leading.quaternion, leading.scale);
    leading.position.x -= 22.60;
    leading.position.z += 1.13;
    root.add(leading);
  }
  // Geometry and textures still belong to useGLTF's cache. Only our material
  // copies are owned by this display, including on selection-screen remounts.
  return {
    root,
    dispose: () => { disposeFloor?.(); workLight?.dispose(); rackLight?.dispose(); materials.forEach(material => material.dispose()); },
  };
}
