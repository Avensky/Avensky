import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

// Coordinates are in Garage Special source units, inside its outer shell and
// behind the counter, tube rack and pillars. The display root supplies scale.
const corners = [[-108, -98], [108, -98], [108, 103], [-108, 103]];
const courses = [
  { surface: "garage-panel", bottom: 0, top: .30, roughness: .52 },
  { surface: "garage-stripe", bottom: .30, top: .322, roughness: .46 },
  { surface: "garage-wall", bottom: .322, top: .812, roughness: .86 },
];

export function createGarageWalls(texture: Texture) {
  texture.wrapS = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const geometry = new BufferGeometry();
  const materials = courses.map(({ surface, bottom, top, roughness }, group) => {
    const start = indices.length;
    const floor = .85, height = 100.15;
    const bottomY = floor + height * bottom, topY = floor + height * top;
    corners.forEach(([x, z], i) => {
      const [endX, endZ] = corners[(i + 1) % corners.length];
      const first = positions.length / 3;
      positions.push(x, bottomY, z, endX, bottomY, endZ, endX, topY, endZ, x, topY, z);
      const span = Math.hypot(endX - x, endZ - z) / 32;
      uvs.push(0, bottom, span, bottom, span, top, 0, top);
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    });
    geometry.addGroup(start, indices.length - start, group);
    const material = new MeshStandardMaterial({ map: texture, roughness });
    material.userData.garageSurface = surface;
    return material;
  });
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, materials);
  mesh.name = "garage-interior-walls";
  return { mesh, dispose() {
    geometry.dispose();
    materials.forEach(material => material.dispose());
  } };
}
