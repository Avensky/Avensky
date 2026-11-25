import { Box3, Mesh, Vector3 } from "three";

/** Weld coincident vertices only for connectivity. Source geometry and indices stay untouched. */
export function emitterBounds(mesh: Mesh) {
  const geometry = mesh.geometry, positions = geometry.getAttribute("position"), indices = geometry.index;
  const parents = Array.from({ length: positions.count }, (_, i) => i);
  const find = (i: number): number => parents[i] === i ? i : (parents[i] = find(parents[i]));
  const link = (a: number, b: number) => { parents[find(a)] = find(b); };
  const welded = new Map<string, number>();
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)].map(v => Math.round(v * 1000)).join(",");
    const prior = welded.get(key);
    if (prior !== undefined) link(i, prior);
    else welded.set(key, i);
  }
  for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
    const a = indices?.getX(i) ?? i;
    link(a, indices?.getX(i + 1) ?? i + 1);
    link(a, indices?.getX(i + 2) ?? i + 2);
  }
  const components = new Map<number, Box3>();
  const point = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    const key = find(i);
    let bounds = components.get(key);
    if (!bounds) { bounds = new Box3(); components.set(key, bounds); }
    bounds.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
  }
  return [...components.values()];
}
