import { createContext, type Ref, type RefObject } from "react";
import { MathUtils, Quaternion, Vector3, type Group, type Object3D } from "three";
import { posePackEmote } from "./posePack";
import { aimDriverJoint, aimLimb, driverArm, driverHand, type Emote } from "./garageEmotes";
import type { VehiclePartHinge } from "../preview/vehiclePartRig";
import type { BrzClearance } from "../preview/brzApproach";

export const OPEN_DRIVER_DOOR = "interact-driver-door";
export const SIT_IN_CHAIR = "interact-chair";
export const PANEL_INTERACTIONS = [
  { id: "interact-hood", label: "Open hood", part: "hood" },
  { id: "interact-trunk", label: "Open trunk", part: "trunk" },
  { id: "inspect-engine", label: "Inspect engine", part: "hood" },
] as const;
export type GaragePanel = typeof PANEL_INTERACTIONS[number]["part"];
export const garagePanelForEmote = (id?: string) => PANEL_INTERACTIONS.find(action => action.id === id)?.part;
export const GaragePanelTarget = createContext<{
  hinge: VehiclePartHinge;
  clearance?: BrzClearance;
  actor: RefObject<Group | null>;
} | undefined>(undefined);

export function preparePanelOpening(root: Object3D, hinge: VehiclePartHinge, inspectEngine = false, fittedReach = false) {
  const grip = hinge.handle;
  const arm = driverArm(root, "r");
  if (!grip || !arm) return undefined;
  const hand = fittedReach ? driverHand(root, "r") : undefined;
  const safetyCatch = fittedReach ? hinge.latchGrip : undefined;
  const neck = root.getObjectByName("neck_01") ?? root.getObjectByName("head");
  const torso = fittedReach || inspectEngine ? root.getObjectByName("spine_02") : undefined;
  const legs = fittedReach ? ["l", "r"].flatMap(side => {
    const thigh = root.getObjectByName(`thigh_${side}`), calf = root.getObjectByName(`calf_${side}`), foot = root.getObjectByName(`foot_${side}`);
    return thigh && calf && foot ? [{ thigh, calf, foot, anchor: new Vector3(), facing: new Quaternion() }] : [];
  }) : [];
  const restHeight = root.position.y;
  const rest = [arm.shoulder, arm.elbow, arm.hand, ...(neck ? [neck] : []), ...(torso ? [torso] : []),
    ...legs.flatMap(({thigh,calf,foot}) => [thigh,calf,foot])]
    .map(joint => ({joint, rotation: joint.quaternion.clone()}));
  const reset = () => { root.position.y = restHeight; rest.forEach(({joint, rotation}) => joint.quaternion.copy(rotation)); };
  const axis = hinge.axis;
  const initial = hinge.angle;
  const target = new Vector3(), wrist = new Vector3(), catchPoint = new Vector3(), shoulder = new Vector3(), elbow = new Vector3();
  const down = new Vector3(0, -1, 0), knee = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  const pitchAxis = new Vector3(), parentRotation = new Quaternion(), bendRotation = new Quaternion();
  const fingers = new Vector3(), palm = new Vector3(), handRest = new Quaternion();
  return {
    sample(seconds: number, positionDriver?: () => void) {
      reset();
      const lift = safetyCatch ? MathUtils.smoothstep(seconds, .74, 1.54) : MathUtils.smoothstep(seconds, .47, 1.42);
      const caught = safetyCatch ? .13 * MathUtils.smoothstep(seconds, .56, .70) : 0;
      const opening = lift + (1 - lift) * caught;
      hinge.angle = MathUtils.lerp(initial, hinge.open, opening);
      hinge.pivot.rotation[axis] = hinge.angle;
      hinge.support?.(hinge.angle / hinge.open);
      if (hinge.latch) hinge.latch.rotation[axis] = Math.sign(hinge.open) * .48 * (safetyCatch
        ? MathUtils.smoothstep(seconds, .48, .59) : MathUtils.smoothstep(seconds, .28, .46));
      positionDriver?.();
      const reach = MathUtils.smoothstep(seconds, .08, .43) * (1 - MathUtils.smoothstep(seconds, safetyCatch ? 1.42 : 1.22, 1.78));
      if (reach > 0) {
        grip.getWorldPosition(target);
        if (safetyCatch && seconds < .74) {
          safetyCatch.getWorldPosition(catchPoint);
          target.lerp(catchPoint, 1 - MathUtils.smoothstep(seconds, .58, .74));
        }
        if (fittedReach && torso?.parent) {
          root.getWorldQuaternion(rotation);
          torso.parent.getWorldQuaternion(parentRotation).invert();
          pitchAxis.set(1, 0, 0).applyQuaternion(rotation).applyQuaternion(parentRotation);
          torso.quaternion.premultiply(bendRotation.setFromAxisAngle(pitchAxis, (safetyCatch && seconds < .74 ? .44 : .37) * reach));
        }
        if (hand) {
          arm.shoulder.getWorldPosition(shoulder);
          arm.hand.getWorldPosition(wrist);
          const span = hand.middle.getWorldPosition(palm).distanceTo(wrist);
          fingers.subVectors(target, shoulder).normalize();
          target.addScaledVector(fingers, -span);
        }
        if (legs.length) {
          arm.shoulder.getWorldPosition(shoulder);
          arm.elbow.getWorldPosition(elbow);
          arm.hand.getWorldPosition(wrist);
          const armLength = shoulder.distanceTo(elbow) + elbow.distanceTo(wrist);
          const horizontal = Math.hypot(shoulder.x - target.x, shoulder.z - target.z);
          const vertical = Math.sqrt(Math.max(.015, (armLength * .94) ** 2 - horizontal ** 2));
          root.parent?.getWorldScale(scale);
          const drop = MathUtils.clamp((shoulder.y - target.y - vertical) / (scale.y || 1), 0, safetyCatch ? .46 : .36) * reach;
          for (const leg of legs) {
            leg.foot.getWorldPosition(leg.anchor);
            leg.foot.getWorldQuaternion(leg.facing);
          }
          root.position.y -= drop;
          root.getWorldQuaternion(rotation);
          for (const leg of legs) {
            knee.set(0, 0, 1).applyQuaternion(rotation);
            aimLimb(leg.thigh, leg.calf, leg.foot, leg.anchor.clone(), knee);
            leg.foot.quaternion.copy(leg.calf.getWorldQuaternion(new Quaternion()).invert().multiply(leg.facing));
          }
        }
        arm.hand.getWorldPosition(wrist).lerp(target, reach);
        aimLimb(arm.shoulder, arm.elbow, arm.hand, wrist, down.clone());
        if (hand) {
          handRest.copy(arm.hand.quaternion);
          aimDriverJoint(arm.hand, hand.middle, fingers);
          arm.hand.quaternion.slerp(handRest, 1 - reach);
        }
      }
      const settle = MathUtils.smoothstep(seconds, 1.3, 1.8);
      if (neck) neck.rotateX((inspectEngine ? .3 : .12) * settle);
      if (torso && inspectEngine) torso.rotateX(.19 * settle);
    },
    stop() {
      reset();
      hinge.support?.(0);
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
