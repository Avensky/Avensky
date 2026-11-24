import { BufferGeometry, MathUtils, Triangle, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";
import { fitWardrobeSurface } from "./wardrobeSurface";

const separateBinding = .25;
const hemSeam = .196;

/** Tailor the binding from the same skinned surface as the skirt to give the seam one continuous edge. */
export function fitLinenNightgownHem(binding: BufferGeometry, fabric: BufferGeometry) {
  const bindingIndex = binding.getIndex(), bindingPosition = binding.getAttribute("position");
  const originalUv = binding.getAttribute("uv");
  if (!bindingIndex || !bindingPosition || !originalUv || !fabric.hasAttribute("uv")) return;
  const trimFaces: number[] = [];
  for (let i = 0; i < bindingIndex.count; i += 3) {
    const a = bindingIndex.getX(i), b = bindingIndex.getX(i + 1), c = bindingIndex.getX(i + 2);
    if (Math.max(bindingPosition.getY(a), bindingPosition.getY(b), bindingPosition.getY(c)) < separateBinding) {
      trimFaces.push(a, b, c);
    }
  }
  if (!trimFaces.length) return;

  const extended = fabric.clone();
  const position = extended.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    // The new band uses the bottom of the skirt itself. Keep the authored hem length.
    position.setY(i, y - .026 * (1 - MathUtils.smoothstep(y, .20, .29)));
  }
  const skirt = fitWardrobeSurface(extended, [p => p.y - hemSeam], 0, true);
  const hem = fitWardrobeSurface(extended, [p => hemSeam - p.y], 0, true);
  const upperBinding = fitWardrobeSurface(binding, [p => p.y - separateBinding], 0, true);
  extended.dispose();
  if (!skirt || !hem || !upperBinding) {
    skirt?.dispose();
    hem?.dispose();
    upperBinding?.dispose();
    return;
  }

  // Sample the existing embroidered trim's UVs onto the new contiguous edge.
  const atlasGeometry = new BufferGeometry().setAttribute("position", bindingPosition).setIndex(trimFaces);
  const atlas = new MeshBVH(atlasGeometry);
  const atlasIndex = atlasGeometry.getIndex()!;
  const point = new Vector3(), triangle = new Triangle(), bary = new Vector3();
  const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const hemPosition = hem.getAttribute("position"), hemUv = hem.getAttribute("uv");
  for (let i = 0; i < hemPosition.count; i++) {
    point.fromBufferAttribute(hemPosition, i);
    const sample = atlas.closestPointToPoint(point, hit)!;
    const face = sample.faceIndex * 3;
    const a = atlasIndex.getX(face), b = atlasIndex.getX(face + 1), c = atlasIndex.getX(face + 2);
    triangle.setFromAttributeAndIndices(bindingPosition, a, b, c);
    triangle.getBarycoord(sample.point, bary) ?? bary.set(1, 0, 0);
    hemUv.setXY(i, originalUv.getX(a) * bary.x + originalUv.getX(b) * bary.y + originalUv.getX(c) * bary.z,
      originalUv.getY(a) * bary.x + originalUv.getY(b) * bary.y + originalUv.getY(c) * bary.z);
  }
  atlasGeometry.dispose();
  const fittedBinding = mergeGeometries([upperBinding, hem]);
  upperBinding.dispose();
  hem.dispose();
  if (!fittedBinding) {
    skirt.dispose();
    return;
  }
  for (const mesh of [skirt, fittedBinding]) {
    mesh.computeTangents();
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }
  return { skirt, binding: fittedBinding };
}
