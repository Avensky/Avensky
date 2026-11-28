import type { PerspectiveCamera } from "three";

/** Carry the displayed lens through the two camera controllers, including a manually zoomed exit. */
export function copyGarageView(source: PerspectiveCamera, destination: PerspectiveCamera) {
  destination.position.copy(source.position);
  destination.quaternion.copy(source.quaternion);
  destination.fov = source.getEffectiveFOV();
  destination.zoom = 1;
  destination.aspect = source.aspect;
  destination.view = source.view ? { ...source.view } : null;
  destination.updateProjectionMatrix();
  destination.updateMatrixWorld();
}

export type ShowroomBounds = { radius: number; halfHeight: number; centerY: number };

/** Fit a turning vehicle's horizontal footprint and projected height inside the open part of the screen. */
export function showroomZoom(bounds: ShowroomBounds, distance: number, elevation: number, fov: number,
  frameHeight: number, availableWidth: number, availableHeight: number) {
  const tan = Math.tan(fov * Math.PI / 360);
  const rise = Math.abs(Math.sin(elevation)), run = Math.cos(elevation);
  const depth = Math.max(.1, distance - bounds.radius * run - bounds.halfHeight * rise);
  const halfHeight = Math.max(.1, bounds.halfHeight * run + bounds.radius * rise);
  // The horizontal projection of a bounding circle has its extremum at the tangent to the eye.
  const sphere = Math.max(.1, Math.hypot(bounds.radius, bounds.halfHeight));
  const horizontal = Math.sqrt(Math.max(.01, distance ** 2 - sphere ** 2)) / sphere;
  return .90 * tan / frameHeight * Math.min(availableWidth * horizontal, availableHeight * depth / halfHeight);
}
