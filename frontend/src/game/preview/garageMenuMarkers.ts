import { useLayoutEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Matrix4, Quaternion, Vector3 } from "three";
import { GARAGE_MENU_LANDMARKS, type GarageMenuStation } from "./garageMenuLandmarks";

const markers = new Map<GarageMenuStation, HTMLElement>();
let markerRevision = 0;
let requestFrame: (() => void) | undefined;

export function registerGarageMenuMarker(station: GarageMenuStation, element: HTMLElement | null) {
  if (element) markers.set(station, element);
  else markers.delete(station);
  markerRevision++;
  requestFrame?.();
}

/** Place DOM controls after the persistent camera samples its interpolated pose for this frame.
 * A stationary camera can keep animating an emote without rewriting any menu styles. */
export function GarageMenuMarkers() {
  const invalidate = useThree(state => state.invalidate);
  const last = useMemo(() => ({
    revision: -1, width: 0, height: 0, left: 0, top: 0,
    position: new Vector3(), orientation: new Quaternion(), lens: new Matrix4(),
  }), []);
  const projection = useMemo(() => new Matrix4(), []);
  const point = useMemo(() => new Vector3(), []);
  useLayoutEffect(() => {
    requestFrame = invalidate;
    invalidate();
    return () => { requestFrame = undefined; };
  }, [invalidate]);
  useFrame(({ camera, size }) => {
    // The portrait menu has its own two-row layout.
    if (!markers.size || size.width < size.height) return;
    if (last.revision === markerRevision && last.width === size.width && last.height === size.height &&
        last.left === size.left && last.top === size.top && last.position.equals(camera.position) &&
        last.orientation.equals(camera.quaternion) && last.lens.equals(camera.projectionMatrix)) return;
    Object.assign(last, size);
    last.revision = markerRevision;
    last.position.copy(camera.position);
    last.orientation.copy(camera.quaternion);
    last.lens.copy(camera.projectionMatrix);
    camera.updateMatrixWorld();
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    for (const [station, element] of markers) {
      point.fromArray(GARAGE_MENU_LANDMARKS[station]).applyMatrix4(projection);
      const x = size.left + (point.x + 1) * size.width * .5;
      const y = size.top + (1 - point.y) * size.height * .5;
      element.style.setProperty("--station-x", `${x.toFixed(1)}px`);
      element.style.setProperty("--station-y", `${y.toFixed(1)}px`);
    }
  }, -.5);
  return null;
}
