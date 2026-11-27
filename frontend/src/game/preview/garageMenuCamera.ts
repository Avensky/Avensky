import { Vector3, type PerspectiveCamera } from "three";
import type { GarageEntryShot } from "./LiveGarage";
import { placeGarageOrbit } from "./garageCameraTravel.ts";
import { GARAGE_MENU_LANDMARKS, type GarageMenuStation } from "./garageMenuLandmarks.ts";
import { ROSTER_HEADING } from "./rosterCamera.ts";

const cameraAngles = {
  enter_world: { heading: 2.94, elevation: .17 },
  wardrobe: { heading: ROSTER_HEADING - .04, elevation: .07 },
  vehicle: { heading: ROSTER_HEADING + .08, elevation: .07 },
  world_editor: { heading: ROSTER_HEADING - .07, elevation: .11 },
};

/** The doorway opens on the selected character. Other stations keep the actor in the shot
 * while shifting the orbit toward the selected prop. The room owns all travel between shots. */
export function garageMenuCamera(station: GarageMenuStation): GarageEntryShot {
  const landmark = new Vector3(...GARAGE_MENU_LANDMARKS[station]);
  const target = new Vector3();
  const angles = cameraAngles[station];
  let distance = 4;
  function orbit(camera: PerspectiveCamera, yaw: number, pitch: number) {
    placeGarageOrbit(camera, target, distance, angles.heading - yaw, angles.elevation + pitch);
  }
  return {
    subject: "ready",
    frame(camera, width, height) {
      const aspect = width / height;
      const portrait = aspect < 1;
      if (station === "enter_world") {
        // Look across the driver toward the exit wall. On a phone the narrower horizontal
        // field shows the central bay; keep the full body above the two rows of controls.
        const pull = .50 / landmark.z;
        target.set(landmark.x * pull, 1.17, landmark.z * pull);
        distance = 2.57;
        camera.fov = portrait ? 80 : 66;
        const centerX = portrait ? .52 : .56;
        const centerY = portrait ? .34 : .40;
        camera.setViewOffset(width, height, width * (.5 - centerX), height * (.5 - centerY), width, height);
        orbit(camera, 0, 0);
        return;
      }
      const pull = portrait ? .47 : .18;
      target.set(0, .88, 0).lerp(landmark, pull);
      // Keep a minimum horizontal span on narrow phones so the actor and the station share the view.
      const fov = portrait ? 46 : 60;
      const verticalSpan = 2 * Math.tan(fov * Math.PI / 360);
      const bodyFraction = portrait ? Math.min(.43, .68 * aspect) : .50;
      distance = Math.max(1.74 / (bodyFraction * verticalSpan), portrait ? 0 : 5.3 / aspect);
      camera.fov = fov;
      // The extra headroom in the wide shot contains the full rear-wall neon sign.
      const centerX = portrait ? .50 : .39, centerY = portrait ? .31 : .58;
      camera.setViewOffset(width, height, width * (.5 - centerX), height * (.5 - centerY), width, height);
      orbit(camera, 0, 0);
    },
    orbit,
  };
}
