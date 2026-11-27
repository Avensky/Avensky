import { Vector3, type PerspectiveCamera } from "three";
import type { GarageEntryShot } from "./LiveGarage";
import { initialGaragePose } from "./garageParkingPhysics";

export const garageParkingPose = initialGaragePose();

export function garageParkingCamera(): GarageEntryShot {
  const aim = new Vector3();
  let portrait = false;
  function orbit(camera: PerspectiveCamera) {
    const c = Math.cos(garageParkingPose.yaw), s = Math.sin(garageParkingPose.yaw);
    const trail = portrait ? 5.6 : 5.1;
    // Keep the chase camera above the workshop fittings and in front of the rear wall.
    camera.position.set(Math.max(-6.3, Math.min(8.15, garageParkingPose.x - trail * s)), portrait ? 4.5 : 3.65,
      Math.max(-5.78, garageParkingPose.z - trail * c));
    aim.set(garageParkingPose.x + s, .68, garageParkingPose.z + c);
    camera.lookAt(aim);
  }
  return {
    subject: "ready", orbit,
    frame(camera, width, height) {
      portrait = height > width;
      camera.fov = portrait ? 68 : 59;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      orbit(camera);
    },
  };
}
