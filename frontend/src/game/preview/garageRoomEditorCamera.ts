import { Vector3, type PerspectiveCamera } from "three";
import { usePersonalGarage } from "../../store/social/personalGarage";
import type { GarageEntryShot } from "./LiveGarage";
import { garagePropFootprint, type GaragePropId } from "./garageServiceLayout";

// Read the actual interpolated lens for floor picking, even during a change of shot.
let displayed: PerspectiveCamera | undefined;
export const garageEditorDisplayedCamera = () => displayed;

export function garageRoomEditorCamera(id: GaragePropId): GarageEntryShot {
  const target = new Vector3(), inward = new Vector3(), eye = new Vector3();
  const aim = (camera: PerspectiveCamera) => {
    displayed = camera;
    camera.position.copy(eye);
    camera.lookAt(target);
  };
  return {
    subject: "ready",
    orbit: aim,
    get framingRevision() { return usePersonalGarage.getState().revision; },
    frame(camera, width, height) {
      const footprint = garagePropFootprint(id, usePersonalGarage.getState().layout[id]);
      target.set(footprint.x, id === "jack" ? .28 : .82, footprint.z);
      inward.set(.75 - target.x, 0, 1.2 - target.z);
      if (inward.lengthSq() < .01) inward.set(0, 0, 1);
      eye.copy(target).addScaledVector(inward.normalize(), 4.5).setY(2.35);
      const tall = width < height;
      camera.fov = tall ? 62 : 56;
      camera.setViewOffset(width, height, width * (tall ? 0 : .14), height * (tall ? .21 : 0), width, height);
      aim(camera);
    },
  };
}
