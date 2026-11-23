import { Group, Mesh, Raycaster, Vector3 } from "three";
import { splitVehicleAssembly } from "./splitGarageSteering";
import type { VehiclePartHinge } from "./vehiclePartRig";

const RELEASES = {
  "door-left": { sourceName: "Mesh139_black1_0", material: "black1", count: 8106, vertex: 904,
    point: [-.726616, .716190, -.219873], ranges: [[302, 371]], surface: -.724, pull: -.7004 },
  "door-right": { sourceName: "Mesh162_black1_0", material: "black1", count: 6783, vertex: 769,
    point: [.720033, .714871, -.219432], ranges: [[257, 326]], surface: .718, pull: .6947 },
} as const;

/** Bind the release lever and the fixed interior pull to the streamed door. */
export function fitBrzDoorHardware(root: Group, hinge: VehiclePartHinge) {
  if (hinge.part !== "door-left" && hinge.part !== "door-right") return;
  const spec = RELEASES[hinge.part];
  const trim = root.getObjectByName(spec.sourceName);
  if (!(trim instanceof Mesh)) return;
  const side = Math.sign(spec.surface);
  const surface = (x: number, y: number, z: number) => {
    const origin = trim.localToWorld(new Vector3(x - side * .09, y, z));
    const direction = trim.localToWorld(new Vector3(x, y, z)).sub(origin).normalize();
    const hit = new Raycaster(origin, direction).intersectObject(trim, false)[0];
    return hit && Math.abs(trim.worldToLocal(hit.point.clone()).x - x) < .008 ? hit.point : undefined;
  };
  const release = surface(spec.surface, .707, -.263);
  const pull = surface(spec.pull, .617, -.244);
  if (pull) {
    const grip = new Group();
    grip.name = "brz-interior-door-pull";
    grip.position.copy(hinge.pivot.worldToLocal(pull));
    hinge.pivot.add(grip);
    hinge.interiorPull = grip;
  }
  if (!release) return;
  const pivot = hinge.pivot.worldToLocal(trim.localToWorld(new Vector3(side * (Math.abs(spec.surface) + .009), .706, -.298)));
  const moving = splitVehicleAssembly(hinge.pivot, [spec], "brz-interior-release-pivot", pivot);
  const parent = moving?.root ?? hinge.pivot;
  const grip = new Group();
  grip.name = "brz-interior-release";
  grip.position.copy(parent.worldToLocal(release));
  parent.add(grip);
  hinge.interiorHandle = grip;
  if (moving) {
    hinge.releaseLever = {
      place(amount) { moving.root.rotation.y = amount === 0 ? 0 : -side * .44 * amount; },
      dispose: moving.dispose,
    };
  }
}
