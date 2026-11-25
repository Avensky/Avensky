import { wallFloor, wallPanels } from "../preview/garageWallLayout.ts";

type Point = [number, number, number];
type UV = [number, number];
const faceUV: UV[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
// The room is fixed architecture. Batch all opaque faces, then draw the emissive halos.
export function entryRoomGeometry() {
  const solid: number[] = [], glow: number[] = [];
  function quad(points: Point[], material: number, uv = faceUV, vertices = solid) {
    const [a, b, c] = points;
    const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const length = Math.hypot(...n) || 1;
    for (const i of [0, 1, 2, 0, 2, 3]) vertices.push(...points[i], ...n.map(v => v / length), ...uv[i], material);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material: number) {
    const l = x - w / 2, r = x + w / 2, b = y - h / 2, t = y + h / 2, f = z + d / 2, k = z - d / 2;
    quad([[l, b, f], [r, b, f], [r, t, f], [l, t, f]], material);
    quad([[r, b, k], [l, b, k], [l, t, k], [r, t, k]], material);
    quad([[l, b, k], [l, b, f], [l, t, f], [l, t, k]], material);
    quad([[r, b, f], [r, b, k], [r, t, k], [r, t, f]], material);
    quad([[l, t, f], [r, t, f], [r, t, k], [l, t, k]], material);
    quad([[l, b, k], [r, b, k], [r, b, f], [l, b, f]], material);
  }
  function strip(x: number, y: number, z: number, w: number, h: number, vertical = false, sideWall = false) {
    const hw = (vertical ? h : w) / 2, hh = (vertical ? w : h) / 2;
    const point = (u: number, v: number, depth: number): Point =>
      sideWall ? [x + depth, y + v, z - u] : [x + u, y + v, z + depth];
    const rectangle = (width: number, height: number, depth: number) =>
      [point(-width, -height, depth), point(width, -height, depth), point(width, height, depth), point(-width, height, depth)];
    quad(rectangle(hw, hh, 0), 6);
    quad(rectangle(hw + 2.7, hh + 2.7, .04), vertical ? 9 : 8, faceUV, glow);
  }
  for (const { group, x, z, endX, endZ, bottom, top, span, bottomY, topY } of wallPanels()) {
    const backWall = z === -98 && endZ === z;
    const leftWall = x === -108 && endX === x;
    if (!backWall && !leftWall) continue;
    quad([[x, bottomY, z], [endX, bottomY, endZ], [endX, topY, endZ], [x, topY, z]], group, [[0, bottom], [span, bottom], [span, top], [0, top]]);
  }
  quad([[-108, wallFloor, 350], [350, wallFloor, 350], [350, wallFloor, -98], [-108, wallFloor, -98]], 3);
  quad([[-108, 82, -98], [108, 82, -98], [108, 82, 103], [-108, 82, 103]], 5);
  // Structural bays and the upper steel truss frame the original concrete wall profile.
  for (const x of [-106, -54, 0, 54, 106]) {
    box(x, 41, -97, 2.4, 81, 2.2, 4);
    box(x, 80, 2, 2.6, 3.5, 200, 4);
    box(x, 2.4, -95.8, 3.4, 3.1, 1.8, 5);
  }
  for (const z of [-95, -48, 0, 48, 99]) {
    box(-107, 41, z, 2.2, 81, 2.4, 4);
    box(0, 79, z, 215, 2.1, 2, 4);
  }
  box(0, 68, -96.7, 215, 1.2, 2.2, 4);
  for (let x = -104; x < 100; x += 13) {
    const up = (Math.round((x + 104) / 13) % 2) === 0;
    const a = up ? 68.3 : 78.4, b = up ? 78.4 : 68.3;
    quad([[x, a, -95.8], [x + 13, b, -95.8], [x + 13, b + 1, -95.8], [x, a + 1, -95.8]], 4);
  }
  for (const x of [-81, -27, 27, 81]) {
    box(x, 66.8, -96.3, 32, 1.9, 2.5, 4);
    strip(x, 66.5, -94.95, 29, .56);
  }
  box(-106.7, 68, 2, 2.2, 1.2, 199, 4);
  for (const z of [-73, -23, 27, 77]) {
    box(-106, 66.8, z, 2.5, 1.9, 27, 4);
    strip(-104.7, 66.5, z, 24, .56, false, true);
  }
  // Wall-mounted segmented numerals. The inactive lower-left segment distinguishes each nine.
  const segments = [[0, 8, 0], [4.3, 4, 1], [4.3, -4, 1], [0, -8, 0], [-4.3, -4, 1], [-4.3, 4, 1], [0, 0, 0]];
  [0, 9, 9, 9].forEach((digit, index) => {
    const x = -86 + index * 12.1;
    for (let i = 0; i < segments.length; i++) {
      if ((digit === 0 && i === 6) || (digit === 9 && i === 4)) continue;
      const [dx, dy, vert] = segments[i], cx = x + dx, cy = 50 + dy;
      box(cx, cy, -95.8, vert ? 1.95 : 7.95, vert ? 7.3 : 1.95, 1.6, 4);
      strip(cx, cy, -94.92, vert ? 6.75 : 7.4, 1.2, Boolean(vert));
    }
  });
  return { vertices: new Float32Array([...solid, ...glow]), solidCount: solid.length / 9, glowCount: glow.length / 9 };
}
