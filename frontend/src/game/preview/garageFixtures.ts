import {
  Box3, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PMREMGenerator, Scene, SpotLight, Vector3, type BufferGeometry, type Object3D, type WebGLRenderer,
} from "three";

// Spot 01 is the freestanding bank of twelve bulbs in the authored scene.
export function isGarageWorkLight(node: Mesh): node is Mesh<BufferGeometry, MeshStandardMaterial> {
  return (node.parent?.userData.name ?? node.parent?.name) === "Cube.001" &&
    node.material instanceof MeshStandardMaterial && node.material.name.trim() === "LIGHT";
}

// The GLB splits each fixture housing and its luminous faces into different primitives.
export function collectGarageFixtures(room: Object3D) {
  const lights = new Group();
  lights.name = "garage-fixture-lights";
  const reflectors = new Scene();
  reflectors.background = new Color(0);
  const surfaces = new Map<MeshStandardMaterial, MeshBasicMaterial>();
  const lamps: { light: SpotLight; face: MeshStandardMaterial; output: number }[] = [];
  room.updateWorldMatrix(true, true);
  room.traverseVisible(node => {
    if (!(node instanceof Mesh) || !(node.material instanceof MeshStandardMaterial)) return;
    const face = node.material;
    const slot = face.name.trim();
    if (slot !== "LIGHT" && slot !== "Material.006") return;
    let mirror = surfaces.get(face);
    if (!mirror) {
      mirror = new MeshBasicMaterial({ side: DoubleSide });
      surfaces.set(face, mirror);
    }
    const emitter = new Mesh(node.geometry, mirror);
    emitter.matrixAutoUpdate = false;
    emitter.matrix.copy(node.matrixWorld);
    reflectors.add(emitter);

    // Three representative ceiling fixtures cover the bay. Every ceiling and neon
    // face, including the 0999 sign, contributes its actual shape to reflections.
    const owner = node.parent?.userData.name ?? node.parent?.name;
    const ceiling = slot === "Material.006" && ["Cube.005", "Cube.010", "Cube.018"].includes(owner);
    const workLamp = isGarageWorkLight(node);
    const rack = slot === "LIGHT" && owner === "Base_Light.001";
    if (!ceiling && !workLamp && !rack) return;
    const light = new SpotLight();
    light.name = ceiling ? "garage-ceiling-" + owner : workLamp ? "garage-work-light-3x4" : "garage-neon-rack";
    new Box3().setFromObject(node, true).getCenter(light.position);
    light.target.position.set(ceiling ? light.position.x : 0, ceiling ? 0 : .65, ceiling ? light.position.z : 0);
    light.angle = ceiling ? 1.43 : rack ? 1.4 : .82;
    light.penumbra = ceiling ? .7 : .88;
    light.distance = 20;
    lamps.push({ light, face, output: ceiling ? 12 : workLamp ? 17 : 4.5 });
    lights.add(light, light.target);
  });
  return {
    lights,
    updateEmission() {
      for (const { light, face, output } of lamps) {
        light.color.copy(face.emissive);
        light.intensity = output * face.emissiveIntensity;
      }
      for (const [face, mirror] of surfaces) mirror.color.copy(face.emissive).multiplyScalar(face.emissiveIntensity);
    },
    capture(renderer: WebGLRenderer) {
      const pmrem = new PMREMGenerator(renderer);
      try { return pmrem.fromScene(reflectors, 0, .05, 32, { size: 64, position: new Vector3(0, 1, 0) }); }
      finally { pmrem.dispose(); }
    },
    dispose() { surfaces.forEach(material => material.dispose()); },
  };
}
