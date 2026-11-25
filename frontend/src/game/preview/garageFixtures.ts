import {
  Box3, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PMREMGenerator, Scene, SpotLight, PointLight, Sprite, SpriteMaterial, DataTexture, RGBAFormat, AdditiveBlending, Vector3, type BufferGeometry, type Object3D, type WebGLRenderer,
} from "three";
import { emitterBounds } from "./garageEmitters.ts";

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
  const lamps: { light: SpotLight | PointLight; face: MeshStandardMaterial; output: number }[] = [];
  const bulbLevels = new Map<MeshStandardMaterial, { intensity: number; bank: string }>();
  const halos: { material: SpriteMaterial; face: MeshStandardMaterial }[] = [];
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    const radius = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
    pixels.set([255, 255, 255, Math.round(255 * Math.pow(Math.max(0, 1 - radius), 2))], i);
  }
  const glow = new DataTexture(pixels, 32, 32, RGBAFormat);
  glow.needsUpdate = true;
  room.updateWorldMatrix(true, true);
  room.traverseVisible(node => {
    if (!(node instanceof Mesh) || !(node.material instanceof MeshStandardMaterial)) return;
    const face = node.material;
    const slot = face.name.trim();
    if ((slot !== "LIGHT" && slot !== "Material.006") || face.emissiveIntensity === 0) return;
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
    const sign = slot === "LIGHT" && (node.name === "Cube024" || node.userData.name === "Cube.024");
    if (!ceiling && !workLamp && !rack && !sign) return;
    const bank = ceiling ? "ceiling" : workLamp ? "work" : rack ? "rack" : "sign";
    if (!sign && !bulbLevels.has(face)) bulbLevels.set(face, { intensity: face.emissiveIntensity, bank });
    const name = ceiling ? "garage-ceiling-" + owner : workLamp ? "garage-work-light-3x4" : rack ? "garage-neon-rack" : "garage-sign";
    const bulbs = ceiling ? [new Box3().setFromObject(node, true)] : emitterBounds(node);
    bulbs.forEach((bounds, index) => {
      const light = ceiling ? new SpotLight() : new PointLight();
      light.name = name + (ceiling ? "" : "-" + index);
      bounds.getCenter(light.position);
      // Offset from the luminous face into the room, keeping the source at the bulb.
      if (!ceiling) {
        const inward = new Vector3(-light.position.x, 0, -light.position.z).normalize();
        light.position.addScaledVector(inward, .035);
      }
      light.distance = sign ? 1.6 : ceiling ? 16 : 5;
      if (light instanceof SpotLight) {
        light.target.position.set(light.position.x, 0, light.position.z);
        light.angle = .92;
        light.penumbra = .7;
        lights.add(light.target);
      }
      lamps.push({ light, face, output: ceiling ? 7 : sign ? .16 : rack ? .13 : .2 });
      lights.add(light);
      if (!ceiling) {
        const material = new SpriteMaterial({
          map: glow, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
        });
        const halo = new Sprite(material);
        halo.name = light.name + "-glow";
        halo.position.copy(light.position);
        const size = bounds.getSize(new Vector3());
        // Long rack tubes need narrow halos following the tube, while work bulbs
        // keep round halos. A large circular sprite makes the source appear behind the rack.
        halo.scale.set(Math.max(.13, Math.hypot(size.x, size.z) + .06), Math.max(.13, size.y + .06), 1);
        lights.add(halo);
        halos.push({ material, face });
      }
    });
  });
  return {
    lights,
    updateEmission(levels: Record<string, number> = {}) {
      for (const [face, { intensity, bank }] of bulbLevels) face.emissiveIntensity = intensity * (levels[bank] ?? 1);
      for (const { light, face, output } of lamps) {
        light.color.copy(face.emissive);
        light.intensity = output * face.emissiveIntensity;
      }
      for (const { material, face } of halos) {
        material.color.copy(face.emissive);
        material.opacity = Math.min(.28, face.emissiveIntensity * .025) * (levels.glow ?? .5) * 2;
      }
      for (const [face, mirror] of surfaces) mirror.color.copy(face.emissive).multiplyScalar(face.emissiveIntensity);
    },
    capture(renderer: WebGLRenderer) {
      const pmrem = new PMREMGenerator(renderer);
      try { return pmrem.fromScene(reflectors, 0, .05, 32, { size: 64, position: new Vector3(0, 1, 0) }); }
      finally { pmrem.dispose(); }
    },
    dispose() { surfaces.forEach(material => material.dispose()); halos.forEach(({ material }) => material.dispose()); glow.dispose(); },
  };
}
