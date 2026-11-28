import { Box3, Matrix4, Mesh, Vector3, type Object3D } from "three";

// The slightly raised front view used by the fitting-room orbit.
const elevation = .08;
const heading = Math.atan(.14);
export const FITTING_BODY_DIRECTION = new Vector3(Math.cos(elevation) * Math.sin(heading), Math.sin(elevation),
  Math.cos(elevation) * Math.cos(heading));

export function measureFittingBody(root: Object3D, stage: Object3D) {
  root.updateWorldMatrix(true, true);
  const toStage = new Matrix4().copy(stage.matrixWorld).invert();
  const transform = new Matrix4();
  const bounds = new Box3();
  const parts: { bottom: number; top: number; radius: number }[] = [];
  let floor = Infinity, crown = -Infinity;
  root.traverseVisible(part => {
    if (!(part instanceof Mesh)) return;
    // glTF supplies rest-pose bounds for the dressed meshes. Animation must
    // not make the camera breathe as the hands or hem move.
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    const local = part.geometry.boundingBox;
    if (!local || local.isEmpty()) return;
    bounds.copy(local).applyMatrix4(transform.multiplyMatrices(toStage, part.matrixWorld));
    const radius = Math.hypot(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
      Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)));
    parts.push({ bottom: bounds.min.y, top: bounds.max.y, radius });
    floor = Math.min(floor, bounds.min.y);
    crown = Math.max(crown, bounds.max.y);
  });
  if (!(crown > floor)) return;
  const height = crown - floor, centerY = (floor + crown) / 2;
  const distance = height * 2.1;
  const rise = FITTING_BODY_DIRECTION.y, run = Math.cos(elevation);
  let halfWidth = 0, halfHeight = 0;
  // Each garment can rotate around the stage. Measure hats, shoes and wide
  // skirts separately so a wide hem does not add imaginary width to a head.
  for (const { bottom, top, radius } of parts) {
    for (const y of [bottom - centerY, top - centerY]) {
      const axisDepth = distance - y * rise;
      const depth = Math.sqrt(Math.max(.01, axisDepth ** 2 - (radius * run) ** 2));
      halfWidth = Math.max(halfWidth, radius / depth);
      for (const z of [-radius, radius]) {
        halfHeight = Math.max(halfHeight, Math.abs(y * run - z * rise) / Math.max(.1, axisDepth - z * run));
      }
    }
  }
  return { centerY, distance, halfWidth, halfHeight };
}

export type FittingBodyFrame = NonNullable<ReturnType<typeof measureFittingBody>>;

/** Fit both projected axes at the actual vertical field of view, leaving a 5% margin per edge. */
export function fullBodyZoom(frame: FittingBodyFrame, fov: number, canvasHeight: number, width: number, height: number) {
  return .90 * Math.tan(fov * Math.PI / 360) / canvasHeight * Math.min(width / frame.halfWidth, height / frame.halfHeight);
}
