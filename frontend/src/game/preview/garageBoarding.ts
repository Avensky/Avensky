import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import { GARAGE_STATIONS } from "./garageStations";
import type { GarageEntryShot } from "./LiveGarage";
import { garageParkingPose } from "./garageParkingCamera";
import type { GarageCarFootprint } from "./GarageParkedVehicle";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";

export const boardingDoor = { opening: 0 };
// The car and actor sample the same measurements, including on the small embedded exterior.
export const boardingCar: GarageCarFootprint = { width: 2.03, length: 4.34, height: 1.24 };

export function parkedDriverStation(model: VehicleModelId, dimensions: GarageCarFootprint) {
  const measured = GARAGE_STATIONS[model];
  const source = measured?.kind === "wheel" ? measured : GARAGE_STATIONS.brz;
  if (source.kind !== "wheel") throw Error("The garage loaner needs a driver seat.");
  // The fleet meshes are floor centred; the detailed art's road stations use several exporter origins.
  const roof = dimensions.height - .045;
  const lift = roof - source.roof;
  const up = ([x, y, z]: readonly number[]) => [x, y + lift, z] as const;
  return { ...source, seat: up(source.seat), roof, pedals: up(source.pedals), rim: up(source.rim),
    steeringParts: undefined, drivingSet: undefined };
}

export function boardingCamera(model: VehicleModelId, fixed = false): GarageEntryShot {
  const aim = new Vector3(), eye = new Vector3(), up = new Vector3(0,1,0);
  const side = Math.sign(parkedDriverStation(model, boardingCar).seat[0]);
  const origin = fixed ? { ...garageParkingPose } : garageParkingPose;
  let tall = false;
  function orbit(camera: PerspectiveCamera) {
    const { x, z, yaw } = origin;
    aim.set(0, .85, 0).applyAxisAngle(up,yaw);
    // Keep the walker and the driver's side together, even with the reduced portrait field of view.
    aim.x += MathUtils.lerp(x, 0, .24); aim.z += MathUtils.lerp(z, 0, .24);
    eye.set(side * (tall ? 4.5 : 3.9), tall ? 2.52 : 1.9, tall ? 4.25 : 2.7).applyAxisAngle(up,yaw);
    if (fixed) {
      // A single locked-off shot shows the character board and leave, with no following pan.
      eye.set(5.8, 3.2, -4.2);
      aim.z += 1.15;
    }
    camera.position.copy(eye).add(aim);
    camera.position.x = MathUtils.clamp(camera.position.x, -5.95, 8.25);
    camera.position.z = MathUtils.clamp(camera.position.z, -5.65, 8.4);
    camera.lookAt(aim);
  }
  return { subject: "ready", frame(camera,w,h) {
    tall = h > w; camera.fov = tall ? 70 : 55; camera.clearViewOffset(); camera.updateProjectionMatrix(); orbit(camera);
  }, orbit };
}
