import { createContext, type Ref, type RefObject } from "react";
import { MathUtils, Quaternion, Vector3, type Group, type Object3D } from "three";
import { posePackEmote } from "./posePack";
import { aimDriverJoint, aimLimb, driverArm, driverHand, type Emote } from "./garageEmotes";
import type { VehiclePartHinge } from "../preview/vehiclePartRig";
import type { BrzClearance } from "../preview/brzApproach";
import { BRZ_HOOD_SECONDS, CLOSE_BRZ_HOOD, INSPECT_BRZ_ENGINE, OPEN_BRZ_HOOD, sampleBrzHood } from "./brzHoodMotion";

export const OPEN_DRIVER_DOOR = "interact-driver-door";
export const SIT_IN_CHAIR = "interact-chair";
export const PANEL_INTERACTIONS = [
  { id: OPEN_BRZ_HOOD, label: "Open hood", part: "hood" },
  { id: "interact-trunk", label: "Open trunk", part: "trunk" },
  { id: INSPECT_BRZ_ENGINE, label: "Inspect engine", part: "hood" },
] as const;
export type GaragePanel = typeof PANEL_INTERACTIONS[number]["part"];
export const garagePanelForEmote = (id?: string) => id === CLOSE_BRZ_HOOD ? "hood" : PANEL_INTERACTIONS.find(action => action.id === id)?.part;
export const GaragePanelTarget = createContext<{
  hinge: VehiclePartHinge;
  clearance?: BrzClearance;
  actor: RefObject<Group | null>;
} | undefined>(undefined);

export function preparePanelOpening(root: Object3D, hinge: VehiclePartHinge, inspectEngine = false, fittedReach = false,
  clearanceOutward?: (target: Vector3) => Vector3, actionId?: string) {
  const grip = hinge.handle;
  const prop = fittedReach && hinge.part === "hood" ? hinge.hoodProp : undefined;
  const safetyCatch = fittedReach ? hinge.latchGrip : undefined;
  const closing = actionId === CLOSE_BRZ_HOOD;
  if (!grip || (closing && !prop)) return undefined;
  const leadSide = prop || (fittedReach && hinge.part === "door-left") ? "l" : "r";
  function armTarget(side: "l" | "r") {
    const arm = driverArm(root, side);
    return arm && { ...arm, digits: fittedReach ? driverHand(root, side) : undefined,
      target: new Vector3(), goal: new Vector3(), fingers: new Vector3(), weight: 0 };
  }
  const lead = armTarget(leadSide);
  const assist = prop ? armTarget("r") : undefined;
  if (!lead || (prop && !assist)) return undefined;
  const arms = assist ? [lead, assist] : [lead];
  const neck = root.getObjectByName("neck_01") ?? root.getObjectByName("head");
  const torso = fittedReach || inspectEngine ? root.getObjectByName("spine_02") : undefined;
  const legs = fittedReach ? ["l", "r"].flatMap(side => {
    const thigh = root.getObjectByName(`thigh_${side}`), calf = root.getObjectByName(`calf_${side}`), foot = root.getObjectByName(`foot_${side}`);
    return thigh && calf && foot ? [{ thigh, calf, foot, side, anchor: new Vector3(), facing: new Quaternion() }] : [];
  }) : [];
  const restHeight = root.position.y;
  const rest = [...arms.flatMap(({shoulder,elbow,hand}) => [shoulder,elbow,hand]),
    ...(neck ? [neck] : []), ...(torso ? [torso] : []), ...legs.flatMap(({thigh,calf,foot}) => [thigh,calf,foot])]
    .map(joint => ({joint, rotation: joint.quaternion.clone()}));
  const reset = () => { root.position.y = restHeight; rest.forEach(({joint, rotation}) => joint.quaternion.copy(rotation)); };
  const { axis, angle: initial } = hinge;
  const inspectOpen = Boolean(prop && inspectEngine && Math.abs(initial / hinge.open) > .93);
  const inspectAt = inspectOpen ? 0 : BRZ_HOOD_SECONDS;
  const duration = prop ? inspectEngine ? inspectAt + .95 : BRZ_HOOD_SECONDS : 1.8;
  const catchPoint = new Vector3(), wrist = new Vector3(), palm = new Vector3(), shoulder = new Vector3(), elbow = new Vector3(), shoe = new Vector3();
  const down = new Vector3(0, -1, 0), knee = new Vector3(), up = new Vector3(0, 1, 0), outward = new Vector3();
  const pitchAxis = new Vector3(), scale = new Vector3();
  const rotation = new Quaternion(), parentRotation = new Quaternion(), bendRotation = new Quaternion(), handRest = new Quaternion();

  return {
    duration,
    sample(seconds: number, positionDriver?: () => void) {
      reset();
      let lean = 0;
      let leftToLip = 1;
      if (prop && assist) {
        const phase = sampleBrzHood(seconds, closing);
        hinge.angle = inspectOpen ? hinge.open : MathUtils.lerp(hinge.closed, hinge.open, phase.hood);
        hinge.pivot.rotation[axis] = hinge.angle;
        prop.place(inspectOpen ? 1 : phase.prop);
        if (hinge.latch) hinge.latch.rotation[axis] = Math.sign(hinge.open) * .48 * (inspectOpen ? 0 : phase.catch);
        lead.weight = inspectOpen ? 0 : phase.leftGrip;
        assist.weight = inspectOpen ? 0 : phase.rightGrip;
        leftToLip = phase.leftToLip;
        lean = (inspectOpen ? 0 : phase.lean) + (inspectEngine ? .40 * MathUtils.smoothstep(seconds, inspectAt, inspectAt + .95) : 0);
      } else {
        const lift = safetyCatch ? MathUtils.smoothstep(seconds, .74, 1.54) : MathUtils.smoothstep(seconds, .47, 1.42);
        const caught = safetyCatch ? .13 * MathUtils.smoothstep(seconds, .56, .70) : 0;
        hinge.angle = MathUtils.lerp(initial, hinge.open, lift + (1 - lift) * caught);
        hinge.pivot.rotation[axis] = hinge.angle;
        hinge.support?.(hinge.angle / hinge.open);
        if (hinge.latch) hinge.latch.rotation[axis] = Math.sign(hinge.open) * .48 * (safetyCatch
          ? MathUtils.smoothstep(seconds, .48, .59) : MathUtils.smoothstep(seconds, .28, .46));
        lead.weight = MathUtils.smoothstep(seconds, .08, .43) *
          (1 - MathUtils.smoothstep(seconds, safetyCatch ? 1.42 : 1.22, 1.78));
        leftToLip = MathUtils.smoothstep(seconds, .58, .74);
        lean = fittedReach ? (safetyCatch && seconds < .74 ? .44 : .37) * lead.weight : 0;
      }
      positionDriver?.();
      grip.getWorldPosition(lead.target);
      if (safetyCatch && leftToLip < 1) lead.target.lerp(safetyCatch.getWorldPosition(catchPoint), 1 - leftToLip);
      if (prop && assist) prop.grip.getWorldPosition(assist.target);
      if (torso?.parent && (lean || inspectEngine)) {
        root.getWorldQuaternion(rotation);
        torso.parent.getWorldQuaternion(parentRotation).invert();
        pitchAxis.set(1, 0, 0).applyQuaternion(rotation).applyQuaternion(parentRotation);
        torso.quaternion.premultiply(bendRotation.setFromAxisAngle(pitchAxis, lean + (inspectEngine && !prop ? .19 * MathUtils.smoothstep(seconds, 1.3, 1.8) : 0)));
      }
      let low = 0;
      for (const arm of arms) {
        if (arm.weight <= 0) continue;
        arm.shoulder.getWorldPosition(shoulder);
        arm.hand.getWorldPosition(wrist);
        arm.goal.copy(arm.target);
        if (arm.digits) {
          const span = arm.digits.middle.getWorldPosition(palm).distanceTo(wrist);
          arm.fingers.subVectors(arm.target, shoulder).normalize();
          arm.goal.addScaledVector(arm.fingers, -span);
        }
        arm.elbow.getWorldPosition(elbow);
        const armLength = shoulder.distanceTo(elbow) + elbow.distanceTo(wrist);
        const horizontal = Math.hypot(shoulder.x - arm.goal.x, shoulder.z - arm.goal.z);
        const vertical = Math.sqrt(Math.max(.015, (armLength * .94) ** 2 - horizontal ** 2));
        low = Math.max(low, (shoulder.y - arm.goal.y - vertical) * arm.weight);
      }
      if (legs.length && low > 0) {
        root.parent?.getWorldScale(scale);
        for (const leg of legs) {
          leg.foot.getWorldPosition(leg.anchor);
          leg.foot.getWorldQuaternion(leg.facing);
        }
        root.position.y -= MathUtils.clamp(low / (scale.y || 1), 0, safetyCatch ? .46 : .36);
        root.getWorldQuaternion(rotation);
        for (const leg of legs) {
          const side = leg.side === "l" ? 1 : -1;
          if (clearanceOutward) {
            clearanceOutward(outward);
            knee.crossVectors(outward, up).multiplyScalar(side).addScaledVector(outward, .14);
          } else knee.set(side, 0, .1).applyQuaternion(rotation);
          aimLimb(leg.thigh, leg.calf, leg.foot, shoe.copy(leg.anchor), knee);
          leg.foot.quaternion.copy(leg.calf.getWorldQuaternion(parentRotation).invert().multiply(leg.facing));
        }
      }
      for (const arm of arms) {
        if (arm.weight <= 0) continue;
        arm.hand.getWorldPosition(wrist).lerp(arm.goal, arm.weight);
        // The elbow hangs below the grip while the spare hand remains free.
        aimLimb(arm.shoulder, arm.elbow, arm.hand, wrist, knee.copy(down));
        if (arm.digits) {
          handRest.copy(arm.hand.quaternion);
          aimDriverJoint(arm.hand, arm.digits.middle, arm.fingers);
          arm.hand.quaternion.slerp(handRest, 1 - arm.weight);
        }
      }
      if (neck && !prop) neck.rotateX((inspectEngine ? .3 : .12) * MathUtils.smoothstep(seconds, 1.3, 1.8));
    },
    stop() {
      reset();
      if (!prop) hinge.support?.(0);
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
