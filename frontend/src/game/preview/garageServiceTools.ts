import {
  BufferGeometry, Color, Float32BufferAttribute, Mesh, Object3D, TorusGeometry, Vector3,
  type Material,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GARAGE_WORKSHOP } from "./garageServiceLayout";

type Point = [number, number, number];

/** Batch each original tool into one draw using the workshop finish. */
export function buildServiceTools(cube: BufferGeometry, tube: BufferGeometry, paint: Material) {
  const pieces: BufferGeometry[] = [];
  const local = new Object3D(), start = new Vector3(), end = new Vector3(), up = new Vector3(0, 1, 0);
  const color = new Color();
  const red = "#a93c2c", redEdge = "#c4543c", graphite = "#404241", black = "#282a29", pin = "#ada99b";

  function add(geometry: BufferGeometry, tint: string) {
    local.updateMatrix();
    const piece = geometry.clone().applyMatrix4(local.matrix);
    const rgb = new Float32Array(piece.attributes.position.count * 3);
    color.set(tint);
    for (let i = 0; i < rgb.length; i += 3) color.toArray(rgb, i);
    piece.setAttribute("color", new Float32BufferAttribute(rgb, 3));
    pieces.push(piece);
  }
  function part(geometry: BufferGeometry, tint: string, center: Point, size: Point, rotation: Point = [0, 0, 0]) {
    local.position.set(...center);
    local.scale.set(...size);
    local.rotation.set(...rotation);
    add(geometry, tint);
  }
  function bar(geometry: BufferGeometry, tint: string, a: Point, b: Point, width: number, depth = width) {
    start.set(...a); end.set(...b);
    local.position.addVectors(start, end).multiplyScalar(.5);
    end.sub(start);
    local.scale.set(width, end.length(), depth);
    local.quaternion.setFromUnitVectors(up, end.normalize());
    add(geometry, tint);
  }
  function finish(name: string, placement: typeof GARAGE_WORKSHOP.jack, scale = 1) {
    const mesh = new Mesh(mergeGeometries(pieces), paint);
    for (const piece of pieces) piece.dispose();
    pieces.length = 0;
    mesh.name = name;
    mesh.position.set(...placement.position);
    mesh.rotation.y = placement.yaw;
    mesh.scale.setScalar(scale);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  // Low-profile hydraulic floor jack. The round saddle and two front wheels face +Z.
  for (const side of [-1, 1]) {
    const x = side * .084;
    bar(cube, red, [x, .105, -.26], [x, .080, .34], .035, .105);
    for (const z of [-.23, .31]) {
      part(tube, black, [side * .107, .045, z], [.090, .037, .090], [0, 0, Math.PI / 2]);
      part(tube, pin, [side * .128, .045, z], [.033, .004, .033], [0, 0, Math.PI / 2]);
    }
    bar(cube, redEdge, [side * .045, .11, -.14], [side * .043, .24, .24], .031, .060);
  }
  part(cube, red, [0, .09, -.18], [.15, .07, .14]);
  bar(tube, graphite, [0, .11, -.19], [0, .15, .09], .060);
  part(tube, graphite, [0, .254, .24], [.15, .028, .15]);
  part(tube, black, [0, .271, .24], [.11, .013, .11]);
  bar(tube, pin, [0, .13, -.245], [0, .68, -.38], .021);
  bar(tube, black, [0, .67, -.378], [0, .81, -.406], .031);
  const jack = finish("garage-floor-jack", GARAGE_WORKSHOP.jack);

  // Folding shop hoist: diverging caster legs, braced mast, hydraulic cylinder and telescoping jib.
  for (const side of [-1, 1]) {
    bar(cube, graphite, [side * .23, .16, -.88], [side * .61, .16, 1.10], .105, .12);
    for (const [x, z] of [[.25, -.96], [.61, 1.09]]) {
      part(cube, red, [side * x, .106, z], [.086, .09, .10]);
      part(tube, black, [side * x, .064, z], [.128, .074, .128], [0, 0, Math.PI / 2]);
    }
    bar(cube, graphite, [side * .31, .22, -.29], [side * .065, .94, -.72], .057);
  }
  part(cube, red, [0, .20, -.83], [.78, .15, .25]);
  bar(cube, red, [0, .22, -.70], [0, 1.46, -.83], .14, .16);
  bar(cube, redEdge, [0, 1.44, -.86], [0, 1.79, .51], .14, .18);
  bar(cube, graphite, [0, 1.78, .47], [0, 1.91, 1.08], .095, .098);
  bar(tube, graphite, [0, .44, -.70], [0, 1.12, -.31], .11);
  bar(tube, pin, [0, 1.09, -.33], [0, 1.66, .01], .058);
  for (const [y, z] of [[.46, -.69], [1.45, -.82], [1.66, .01]])
    part(tube, pin, [0, y, z], [.077, .156, .077], [0, 0, Math.PI / 2]);
  bar(tube, pin, [0, 1.90, 1.08], [0, 1.66, 1.08], .021);
  const hook = new TorusGeometry(.055, .014, 6, 14, 1.59 * Math.PI);
  part(hook, pin, [0, 1.62, 1.08], [1, 1, 1], [0, Math.PI / 2, .15]);
  hook.dispose();
  const crane = finish("garage-engine-hoist", GARAGE_WORKSHOP.crane, GARAGE_WORKSHOP.crane.scale);
  return { "car-jack": jack, "engine-crane": crane };
}
