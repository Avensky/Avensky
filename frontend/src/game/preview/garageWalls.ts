import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

import { wallCourses, wallPanels } from "./garageWallLayout.ts";

export function createGarageWalls(texture: Texture) {
  texture.wrapS = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const geometry = new BufferGeometry();
  for (const { x, z, endX, endZ, span, bottom, top, bottomY, topY } of wallPanels()) {
    const first = positions.length / 3;
    positions.push(x, bottomY, z, endX, bottomY, endZ, endX, topY, endZ, x, topY, z);
    uvs.push(0, bottom, span, bottom, span, top, 0, top);
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const perCourse = indices.length / wallCourses.length;
  const materials = wallCourses.map(({ surface, roughness }, group) => {
    geometry.addGroup(group * perCourse, perCourse, group);
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
