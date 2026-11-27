import { Box3, Matrix4, Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";
import { garagePropFootprint, GARAGE_PROP_IDS, type GaragePropId, type GarageRoomLayout } from "../../game/preview/garageServiceLayout";
import { garageEditorDisplayedCamera } from "../../game/preview/garageRoomEditorCamera";

const itemHeight: Record<GaragePropId, number> = { lockers: 2.2, desk: 1.55, shelf: 1.8, toolbox: 1.05, jack: .34, crane: 2.15 };
type Surface = { left: number; top: number; width: number; height: number };

export function editorFloorRay(x: number, y: number, bounds: Surface, camera = garageEditorDisplayedCamera()) {
  if (!camera || !bounds.width || !bounds.height) return null;
  const point = new Vector2((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2);
  const cast = new Raycaster();
  cast.setFromCamera(point, camera);
  return cast.ray;
}

export function pickGarageProp(x: number, y: number, bounds: Surface, layout: GarageRoomLayout) {
  const ray = editorFloorRay(x, y, bounds);
  if (!ray) return null;
  const inverse = new Matrix4(), hit = new Vector3(), box = new Box3();
  let best = Infinity, picked: GaragePropId | null = null;
  for (const id of GARAGE_PROP_IDS) {
    const { x, z, yaw, halfWidth, halfLength } = garagePropFootprint(id, layout[id]);
    const h = itemHeight[id];
    inverse.makeRotationY(yaw).setPosition(x, h / 2, z).invert();
    box.min.set(-halfWidth, -h / 2, -halfLength);
    box.max.set(halfWidth, h / 2, halfLength);
    const localRay = ray.clone().applyMatrix4(inverse);
    if (!localRay.intersectBox(box, hit)) continue;
    const distance = localRay.origin.distanceToSquared(hit);
    if (distance < best) { best = distance; picked = id; }
  }
  return picked;
}

export function garageFloorPoint(x: number, y: number, bounds: Surface, camera: PerspectiveCamera) {
  const ray = editorFloorRay(x, y, bounds, camera);
  if (!ray || ray.direction.y >= -.015) return null;
  const hit = ray.at(-ray.origin.y / ray.direction.y, new Vector3());
  return [hit.x, hit.z] as const;
}
