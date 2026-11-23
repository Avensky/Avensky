import { createContext, type Ref } from "react";
import { MathUtils, Quaternion, Vector3, type Group, type Object3D } from "three";
import { posePackEmote } from "./posePack";
import { aimLimb, driverArm, type Emote } from "./garageEmotes";
import type { VehiclePartHinge } from "../preview/vehiclePartRig";

export const OPEN_DRIVER_DOOR = "interact-driver-door";
export const SIT_IN_CHAIR = "interact-chair";
export const PANEL_INTERACTIONS = [
  { id: "interact-hood", label: "Open hood", part: "hood" },
  { id: "interact-trunk", label: "Open trunk", part: "trunk" },
  { id: "inspect-engine", label: "Inspect engine", part: "hood" },
] as const;
export type GaragePanel = typeof PANEL_INTERACTIONS[number]["part"];
export const garagePanelForEmote = (id?: string) => PANEL_INTERACTIONS.find(action => action.id === id)?.part;
export const GaragePanelTarget = createContext<VehiclePartHinge | undefined>(undefined);

export function preparePanelOpening(root: Object3D, hinge: VehiclePartHinge, inspectEngine = false) {
  const grip = hinge.handle;
  const arm = driverArm(root, "r");
  if (!grip || !arm) return undefined;
  const neck = root.getObjectByName("neck_01") ?? root.getObjectByName("head");
  const torso = inspectEngine ? root.getObjectByName("spine_03") : undefined;
  const rest = [arm.shoulder, arm.elbow, arm.hand, ...(neck ? [neck] : []), ...(torso ? [torso] : [])]
    .map(joint => ({joint, rotation: joint.quaternion.clone()}));
  const reset = () => rest.forEach(({joint, rotation}) => joint.quaternion.copy(rotation));
  const axis = hinge.axis;
  const initial = hinge.angle;
  const target = new Vector3(), wrist = new Vector3(), down = new Vector3(0, -1, 0);
  return {
    sample(seconds: number) {
      reset();
      const opening = MathUtils.smoothstep(seconds, .47, 1.42);
      hinge.angle = MathUtils.lerp(initial, hinge.open, opening);
      hinge.pivot.rotation[axis] = hinge.angle;
      if (hinge.latch) hinge.latch.rotation[axis] = Math.sign(hinge.open) * .48 * MathUtils.smoothstep(seconds, .28, .46);
      const reach = MathUtils.smoothstep(seconds, .08, .43) * (1 - MathUtils.smoothstep(seconds, 1.22, 1.78));
      if (reach > 0) {
        arm.hand.getWorldPosition(wrist).lerp(grip.getWorldPosition(target), reach);
        aimLimb(arm.shoulder, arm.elbow, arm.hand, wrist, down.clone());
      }
      const settle = MathUtils.smoothstep(seconds, 1.3, 1.8);
      if (neck) neck.rotateX((inspectEngine ? .3 : .12) * settle);
      if (torso) torso.rotateX(.19 * settle);
    },
    stop() {
      reset();
      if (hinge.latch) hinge.latch.rotation[axis] = 0;
    },
  };
}
export const CHAIR_SEAT = "emote-chair-seat";
const SEAT_HEIGHT = .45;

export function chairSitClip(root: Object3D, seat: Object3D | undefined): Emote | undefined {
  const left = root.getObjectByName("thigh_l");
  const right = root.getObjectByName("thigh_r");
  if (!seat || seat.name !== CHAIR_SEAT || !left || !right) return undefined;
  const hips = left.getWorldPosition(new Vector3()).lerp(right.getWorldPosition(new Vector3()), .5);
  const target = root.worldToLocal(seat.getWorldPosition(new Vector3()));
  const shift = target.sub(root.worldToLocal(hips));
  // The hip joints sit above the contact surface. This preview chair and both
  // starter rigs face the same way in their shared garage parent.
  shift.y += .07;
  if (Math.abs(shift.x) > .65 || Math.abs(shift.z) > .75 || shift.y < -.65 || shift.y > -.12) return undefined;
  const forward = seat.getWorldDirection(new Vector3()).applyQuaternion(root.getWorldQuaternion(new Quaternion()).invert());
  const turn = Math.atan2(forward.x, forward.z);
  if (Math.abs(turn) > Math.PI / 2) return undefined;
  const sit = posePackEmote("pose-mh-poses01-callharvey3d_sittingdefault")?.keys[0][1];
  return {
    id: SIT_IN_CHAIR, name: "Sit down", duration: 1.5,
    keys: [
      [0, {}],
      [.24, { torso: [.12, 0, 0], rise: shift.y * .12, travel: shift.z * .25, sway: shift.x * .25, turn: turn * .55 }],
      [.7, { ...sit, rise: shift.y * .85, sway: shift.x, travel: shift.z * .9, turn }],
      [1, { ...sit, rise: shift.y, sway: shift.x, travel: shift.z, turn }],
    ],
  };
}

export function InteractionChair({ visible, seatRef }: { visible: boolean; seatRef: Ref<Group> }) {
  return <group name="garage-emote-chair" position={[0, .005, -.3]} visible={visible}>
    <group name={CHAIR_SEAT} ref={seatRef} position={[0, SEAT_HEIGHT, 0]} />
    <mesh position={[0, SEAT_HEIGHT - .03, 0]} castShadow>
      <boxGeometry args={[.48, .06, .46]} /><meshStandardMaterial color="#303a3f" roughness={.9} />
    </mesh>
    <mesh position={[0, .72, -.207]} castShadow>
      <boxGeometry args={[.47, .35, .055]} /><meshStandardMaterial color="#303a3f" roughness={.9} />
    </mesh>
    {[-.195, .195].flatMap(x => [-.175, .175].map(z => <mesh key={`${x}:${z}`} position={[x, .21, z]} castShadow>
      <boxGeometry args={[.036, .42, .036]} /><meshStandardMaterial color="#626c71" metalness={.6} roughness={.55} />
    </mesh>))}
  </group>;
}
