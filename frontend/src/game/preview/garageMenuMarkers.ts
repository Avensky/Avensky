import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Matrix4, Quaternion, Vector3, Vector4 } from "three";
import { GARAGE_MENU_LANDMARKS, type GarageMenuStation } from "./garageMenuLandmarks";

type Marker = {
  station: GarageMenuStation;
  element: HTMLElement;
  button: HTMLElement;
  width: number;
  height: number;
  x: number;
  y: number;
};

const markers = new Map<GarageMenuStation, Marker>();
const stationOrder = Object.keys(GARAGE_MENU_LANDMARKS) as GarageMenuStation[];
let markerRevision = 0;
let requestFrame: (() => void) | undefined;
let observer: ResizeObserver | undefined;

function invalidateLayout() {
  markerRevision++;
  requestFrame?.();
}

export function registerGarageMenuMarker(station: GarageMenuStation, element: HTMLElement | null) {
  const previous = markers.get(station);
  if (previous) observer?.unobserve(previous.button);
  const button = element?.firstElementChild;
  if (element && button instanceof HTMLElement) {
    markers.set(station, { station, element, button, width: 0, height: 0, x: 0, y: 0 });
    observer?.observe(button);
  } else markers.delete(station);
  invalidateLayout();
}

/** Sample the camera after its travel update. The lower row holds destinations that are
 * offscreen or whose labels would overlap. A parked camera writes no menu styles. */
export function GarageMenuMarkers() {
  const invalidate = useThree(state => state.invalidate);
  const frame = useRef({
    revision: -1, width: 0, height: 0, left: 0, top: 0,
    position: new Vector3(), orientation: new Quaternion(), lens: new Matrix4(),
    field: new DOMRect(), projection: new Matrix4(), clip: new Vector4(), placed: [] as Marker[], dockHeight: 0,
  });
  useLayoutEffect(() => {
    requestFrame = invalidate;
    observer = new ResizeObserver(invalidateLayout);
    for (const marker of markers.values()) observer.observe(marker.button);
    invalidate();
    return () => {
      observer?.disconnect();
      observer = undefined;
      requestFrame = undefined;
    };
  }, [invalidate]);
  useFrame(({ camera, size }) => {
    const last = frame.current;
    if (!markers.size || size.width < size.height || size.width <= 640) {
      last.width = 0;
      return;
    }
    const resized = last.width !== size.width || last.height !== size.height ||
      last.left !== size.left || last.top !== size.top || last.revision !== markerRevision;
    if (!resized && last.position.equals(camera.position) &&
        last.orientation.equals(camera.quaternion) && last.lens.equals(camera.projectionMatrix)) return;

    if (resized) {
      const field = markers.values().next().value?.element.parentElement;
      if (!field) return;
      last.field = field.getBoundingClientRect();
      last.dockHeight = 0;
      for (const marker of markers.values()) {
        marker.width = marker.button.offsetWidth;
        marker.height = marker.button.offsetHeight;
        last.dockHeight = Math.max(last.dockHeight, marker.height);
      }
    }
    Object.assign(last, { width: size.width, height: size.height, top: size.top, left: size.left, revision: markerRevision });
    last.position.copy(camera.position);
    last.orientation.copy(camera.quaternion);
    last.lens.copy(camera.projectionMatrix);
    camera.updateMatrixWorld();
    last.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    last.placed.length = 0;

    const place = (marker: Marker) => {
      const { width, height, field, clip } = last;
      const [x, y, z] = GARAGE_MENU_LANDMARKS[marker.station];
      clip.set(x, y, z, 1).applyMatrix4(last.projection);
      let dock = clip.w <= 0 || Math.abs(clip.z) > clip.w;
      if (!dock) {
        marker.x = size.left - field.left + (1 + clip.x / clip.w) * width * .5;
        marker.y = size.top - field.top + (1 - clip.y / clip.w) * height * .5 - 10;
        dock = marker.x < marker.width / 2 || marker.x > field.width - marker.width / 2 ||
          marker.y < marker.height || marker.y > field.height - last.dockHeight - 17;
        if (!dock) dock = last.placed.some(other =>
          Math.abs(marker.x - other.x) < (marker.width + other.width) / 2 + 8 &&
          marker.y + 16 > other.y - other.height && marker.y - marker.height < other.y + 16);
      }
      if (dock) {
        marker.x = field.width * (stationOrder.indexOf(marker.station) + .5) / stationOrder.length;
        marker.y = field.height;
      } else last.placed.push(marker);
      const { element } = marker;
      if (element.dataset.docked !== String(dock)) element.dataset.docked = String(dock);
      element.style.setProperty("--station-x", `${marker.x.toFixed(1)}px`);
      element.style.setProperty("--station-y", `${marker.y.toFixed(1)}px`);
    };
    let selected: Marker | undefined;
    for (const marker of markers.values()) if (marker.button.dataset.selected === "true") selected = marker;
    if (selected) place(selected);
    for (const marker of markers.values()) if (marker !== selected) place(marker);
  }, -.5);
  return null;
}
