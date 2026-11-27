import { Vector3, type PerspectiveCamera } from "three";
import type { GarageEntryShot } from "./LiveGarage";
import { garageOrbitDirection, placeGarageOrbit } from "./garageCameraTravel.ts";
import { GARAGE_MENU_LANDMARKS, type GarageMenuStation } from "./garageMenuLandmarks.ts";

// Eye positions in the clear aisle, in floor metres from the character.
// Portrait views look farther along the aisle to fit the station and actor side by side.
const stationEyes = {
  wardrobe: { wide: [3.6, 1.77, .62], tall: [2.70, 1.65, 1.75], tallFov: 70, tallStationWeight: .5 },
  vehicle: { wide: [1.50, 1.85, 3.65], tall: [5.90, 2.48, 6.95], tallFov: 80, tallStationWeight: .8 },
  world_editor: { wide: [3.00, 2.1, 3.95], tall: [-3.0, 2.55, 5.55], tallFov: 77, tallStationWeight: .55 },
} as const;

export function garageMenuCamera(station: GarageMenuStation, anchor: readonly [number, number, number] = GARAGE_MENU_LANDMARKS[station]): GarageEntryShot {
  const landmark = new Vector3(...anchor);
  const base = GARAGE_MENU_LANDMARKS[station];
  const bearingChange = Math.atan2(landmark.x, landmark.z) - Math.atan2(base[0], base[2]);
  const actor = new Vector3(0, .88, 0), target = new Vector3();
  const actorRay = new Vector3(), stationRay = new Vector3();
  let distance = 2.57, heading = 2.94, elevation = .17, stationWeight = .5;

  function orbit(camera: PerspectiveCamera, yaw: number, pitch: number) {
    if (station === "enter_world") {
      placeGarageOrbit(camera, target, distance, heading - yaw, elevation + pitch);
      return;
    }
    garageOrbitDirection(actorRay, heading - yaw, elevation + pitch).negate();
    camera.position.copy(actor).addScaledVector(actorRay, -distance);
    // The normalized sightlines keep the near character and the distant station
    // in frame independently of depth. The narrow vehicle shot gives its nose more room.
    stationRay.subVectors(landmark, camera.position).normalize();
    target.copy(camera.position).addScaledVector(actorRay, 1 - stationWeight).addScaledVector(stationRay, stationWeight);
    camera.lookAt(target);
  }

  return {
    subject: "ready",
    frame(camera, width, height) {
      const aspect = width / height;
      const portrait = aspect < 1;
      let centerX = .50, centerY = portrait ? .36 : .49;
      if (station === "enter_world") {
        target.set(landmark.x * .50 / landmark.z, 1.17, .50);
        camera.fov = portrait ? 80 : 66;
        centerX = portrait ? .52 : .56;
        centerY = portrait ? .34 : .40;
      } else {
        const view = stationEyes[station];
        const [x, y, z] = view[portrait ? "tall" : "wide"];
        const horizontal = Math.hypot(x, z);
        distance = Math.hypot(horizontal, y - actor.y);
        heading = Math.atan2(x, z) + bearingChange;
        elevation = Math.atan2(y - actor.y, horizontal);
        camera.fov = portrait ? view.tallFov : 59;
        stationWeight = portrait ? view.tallStationWeight : .5;
      }
      camera.setViewOffset(width, height, width * (.5 - centerX), height * (.5 - centerY), width, height);
      orbit(camera, 0, 0);
    },
    orbit,
  };
}
