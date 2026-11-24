import { createContext, type Ref, type RefObject } from "react";
import { MathUtils, Quaternion, Vector3, type Group, type Object3D } from "three";
import { posePackEmote } from "./posePack";
import { aimDriverJoint, aimLimb, alignJointNormal, driverArm, driverHand, type Emote } from "./garageEmotes";
import type { VehiclePartHinge } from "../preview/vehiclePartRig";
import type { BrzClearance } from "../preview/brzApproach";
import { BRZ_HOOD_SECONDS, BRZ_INSPECT_SECONDS, BRZ_TWEAK_SECONDS, CLOSE_BRZ_HOOD, INSPECT_BRZ_ENGINE, OPEN_BRZ_HOOD,
  TWEAK_BRZ_ENGINE, sampleBrzEngine, sampleBrzHood } from "./brzHoodMotion";
import { BRZ_WRENCH_REACH, createBrzWrench } from "./brzWrench";

export const OPEN_DRIVER_DOOR = "interact-driver-door";
export const CLOSE_DRIVER_DOOR = "close-driver-door";
export const OPEN_PASSENGER_DOOR = "open-passenger-door";
export const CLOSE_PASSENGER_DOOR = "close-passenger-door";
export const ENTER_DRIVER = "enter-driver";
export const ENTER_PASSENGER = "enter-passenger";
export function garageDoorForEmote(id?: string) {
  if (id === OPEN_DRIVER_DOOR || id === CLOSE_DRIVER_DOOR || id === ENTER_DRIVER) return "driver-door";
  if (id === OPEN_PASSENGER_DOOR || id === CLOSE_PASSENGER_DOOR || id === ENTER_PASSENGER) return "passenger-door";
}
export const isDoorClosing = (id?: string) => id === CLOSE_DRIVER_DOOR || id === CLOSE_PASSENGER_DOOR;
export const SIT_IN_CHAIR = "interact-chair";
export const PANEL_INTERACTIONS = [
  { id: OPEN_BRZ_HOOD, label: "Open hood", part: "hood" },
  { id: "interact-trunk", label: "Open trunk", part: "trunk" },
  { id: INSPECT_BRZ_ENGINE, label: "Inspect engine", part: "hood" },
] as const;
export type GaragePanel = typeof PANEL_INTERACTIONS[number]["part"];
export const garagePanelForEmote = (id?: string) => id === CLOSE_BRZ_HOOD || id === TWEAK_BRZ_ENGINE
  ? "hood" : PANEL_INTERACTIONS.find(action => action.id === id)?.part;
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
  const shuttingDoor = isDoorClosing(actionId);
  const tweaking = actionId === TWEAK_BRZ_ENGINE;
  const engine = prop && (inspectEngine || tweaking) ? hinge.engineBay : undefined;
  const hoodIsSupported = Boolean(prop && Math.abs(hinge.angle - hinge.open) < .004);
  if (!grip || (closing && !prop) || (shuttingDoor && (!fittedReach || Math.abs(hinge.angle - hinge.closed) < .005))
    || (tweaking && (!engine || !hoodIsSupported))) return undefined;
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
  const tool = tweaking ? createBrzWrench(root) : undefined;
  const hipPocket = tool ? root.getObjectByName("thigh_r") : undefined;
  const neck = root.getObjectByName("neck_01") ?? root.getObjectByName("head");
  const torso = fittedReach || inspectEngine ? root.getObjectByName("spine_02") : undefined;
  const legs = fittedReach ? ["l", "r"].flatMap(side => {
    const thigh = root.getObjectByName(`thigh_${side}`), calf = root.getObjectByName(`calf_${side}`), foot = root.getObjectByName(`foot_${side}`);
    return thigh && calf && foot ? [{ thigh, calf, foot, side, anchor: new Vector3(), facing: new Quaternion() }] : [];
  }) : [];
  const restPosition = root.position.clone();
  const rest = [...arms.flatMap(({ shoulder, elbow, hand, digits }) => [
    shoulder, elbow, hand, ...(engine ? digits?.fingers.map(({ joint }) => joint) ?? [] : []),
  ]),
    ...(neck ? [neck] : []), ...(torso ? [torso] : []), ...legs.flatMap(({thigh,calf,foot}) => [thigh,calf,foot])]
    .map(joint => ({joint, rotation: joint.quaternion.clone()}));
  const reset = () => { root.position.copy(restPosition); rest.forEach(({joint, rotation}) => joint.quaternion.copy(rotation)); };
  const { axis, angle: initial } = hinge;
  const inspectOpen = Boolean((inspectEngine || tweaking) && hoodIsSupported);
  const inspectAt = inspectOpen ? 0 : BRZ_HOOD_SECONDS;
  const duration = !prop ? 1.8 : tweaking ? BRZ_TWEAK_SECONDS
    : inspectEngine ? inspectAt + (engine ? BRZ_INSPECT_SECONDS : .95) : BRZ_HOOD_SECONDS;
  const catchPoint = new Vector3(), wrist = new Vector3(), palm = new Vector3(), shoulder = new Vector3(), elbow = new Vector3(), shoe = new Vector3();
  const down = new Vector3(0, -1, 0), knee = new Vector3(), up = new Vector3(0, 1, 0), outward = new Vector3();
  const pitchAxis = new Vector3(), scale = new Vector3(), palmNormal = new Vector3();
  const pocket = new Vector3(), toolDirection = new Vector3(), toolGrip = new Vector3();
  const rotation = new Quaternion(), parentRotation = new Quaternion(), bendRotation = new Quaternion(), handRest = new Quaternion();

  return {
    duration,
    sample(seconds: number, positionDriver?: () => void) {
      reset();
      let lean = 0;
      let leftToLip = 1;
      const work = engine && seconds >= inspectAt ? sampleBrzEngine(seconds - inspectAt, tweaking) : undefined;
      if (prop && assist) {
        const phase = sampleBrzHood(seconds, closing);
        hinge.angle = inspectOpen ? hinge.open : MathUtils.lerp(hinge.closed, hinge.open, phase.hood);
        hinge.pivot.rotation[axis] = hinge.angle;
        prop.place(inspectOpen ? 1 : phase.prop);
        if (hinge.latch) hinge.latch.rotation[axis] = Math.sign(hinge.open) * .48 * (inspectOpen ? 0 : phase.catch);
        lead.weight = work ? work.brace : inspectOpen ? 0 : phase.leftGrip;
        assist.weight = work ? Math.max(work.reach, work.pickup) : inspectOpen ? 0 : phase.rightGrip;
        leftToLip = phase.leftToLip;
        lean = work?.lean ?? ((inspectOpen ? 0 : phase.lean)
          + (inspectEngine && !engine ? .40 * MathUtils.smoothstep(seconds, inspectAt, inspectAt + .95) : 0));
      } else {
        const lift = safetyCatch ? MathUtils.smoothstep(seconds, .74, 1.54) : MathUtils.smoothstep(seconds, .47, 1.42);
        const caught = safetyCatch ? .13 * MathUtils.smoothstep(seconds, .56, .70) : 0;
        const push = .34 * MathUtils.smoothstep(seconds, .47, 1.04) + .66 * MathUtils.smoothstep(seconds, .95, 1.45);
        hinge.angle = MathUtils.lerp(initial, shuttingDoor ? hinge.closed : hinge.open, shuttingDoor ? push : lift + (1 - lift) * caught);
        hinge.pivot.rotation[axis] = hinge.angle;
        hinge.support?.(hinge.angle / hinge.open);
        if (hinge.latch) hinge.latch.rotation[axis] = Math.sign(hinge.open) * .48 * (safetyCatch
          ? MathUtils.smoothstep(seconds, .48, .59) : MathUtils.smoothstep(seconds, .28, .46));
        lead.weight = MathUtils.smoothstep(seconds, .08, .43) *
          (1 - MathUtils.smoothstep(seconds, shuttingDoor ? .89 : safetyCatch ? 1.42 : 1.22, shuttingDoor ? 1.12 : 1.78));
        leftToLip = MathUtils.smoothstep(seconds, .58, .74);
        lean = fittedReach ? (shuttingDoor ? .53 : safetyCatch && seconds < .74 ? .44 : .37) * lead.weight : 0;
      }
      positionDriver?.();
      grip.getWorldPosition(lead.target);
      if (safetyCatch && leftToLip < 1) lead.target.lerp(safetyCatch.getWorldPosition(catchPoint), 1 - leftToLip);
      if (prop && assist) prop.grip.getWorldPosition(assist.target);
      if (work && engine && assist) {
        root.parent?.getWorldScale(scale);
        engine.brace.getWorldPosition(lead.target).addScaledVector(up, work.hover * .68 * scale.y);
        (tweaking ? engine.fitting : engine.intake).getWorldPosition(assist.target).addScaledVector(up, work.hover * scale.y);
        if (clearanceOutward && root.parent) {
          for (const leg of legs) {
            leg.foot.getWorldPosition(leg.anchor);
            leg.foot.getWorldQuaternion(leg.facing);
          }
          clearanceOutward(outward);
          root.parent.getWorldQuaternion(parentRotation).invert();
          // Shift weight over the planted shoes for the deeper intake fitting.
          root.position.addScaledVector(pitchAxis.copy(outward).applyQuaternion(parentRotation),
            -work.lean / .56 * (tweaking ? .10 : .04));
        }
      }
      if (tool && work && engine && assist) {
        const size = root.getWorldScale(scale).y;
        root.getWorldQuaternion(rotation);
        (hipPocket ?? root).getWorldPosition(pocket);
        pocket.addScaledVector(pitchAxis.set(-.088, .105, .055).applyQuaternion(rotation), size);
        toolDirection.copy(outward).negate().applyAxisAngle(up, work.turn);
        engine.fitting.getWorldPosition(assist.target).addScaledVector(up, (.013 + work.hover) * size)
          .addScaledVector(toolDirection, -BRZ_WRENCH_REACH * size);
        const time = seconds - inspectAt;
        const toFitting = MathUtils.smoothstep(time, .70, 1.88) * (1 - MathUtils.smoothstep(time, 3.75, 4.65));
        assist.target.lerp(pocket, 1 - toFitting);
      }
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
          if (work) for (const { joint, axis, segment } of arm.digits.fingers) {
            joint.rotateOnAxis(axis, (arm === assist ? work.curl : .10 * work.brace) * (1 - .25 * segment));
          }
          const contact = (work && !(tool && arm === assist) && arm.digits.fingertip) || arm.digits.middle;
          const span = contact.getWorldPosition(palm).distanceTo(wrist);
          if (tool && arm === assist && work) arm.fingers.copy(toolDirection);
          else if (work && clearanceOutward) arm.fingers.copy(outward).negate().addScaledVector(down, .19).normalize();
          else arm.fingers.subVectors(arm.target, shoulder).normalize();
          arm.goal.addScaledVector(arm.fingers, -span);
        }
        arm.elbow.getWorldPosition(elbow);
        const armLength = shoulder.distanceTo(elbow) + elbow.distanceTo(wrist);
        const horizontal = Math.hypot(shoulder.x - arm.goal.x, shoulder.z - arm.goal.z);
        const vertical = Math.sqrt(Math.max(.015, (armLength * .94) ** 2 - horizontal ** 2));
        low = Math.max(low, (shoulder.y - arm.goal.y - vertical) * arm.weight);
      }
      if (legs.length && (low > 0 || work?.lean)) {
        root.parent?.getWorldScale(scale);
        if (!work || !clearanceOutward) for (const leg of legs) {
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
        // Bring the forearm over the front support before lowering the fingers.
        if (work && clearanceOutward) knee.copy(outward).addScaledVector(up, .42);
        else knee.copy(down);
        aimLimb(arm.shoulder, arm.elbow, arm.hand, wrist, knee);
        if (arm.digits) {
          handRest.copy(arm.hand.quaternion);
          const contact = (work && !(tool && arm === assist) && arm.digits.fingertip) || arm.digits.middle;
          aimDriverJoint(arm.hand, contact, arm.fingers);
          if (work) {
            palmNormal.copy(down);
            alignJointNormal(arm.hand, arm.fingers, arm.digits.palm, palmNormal);
          }
          arm.hand.quaternion.slerp(handRest, 1 - arm.weight);
        }
      }
      if (tool && work && assist) {
        const gripJoint = assist.digits?.middle ?? assist.hand;
        tool.place(work.carried ? gripJoint.getWorldPosition(toolGrip) : toolGrip.copy(pocket), toolDirection,
          seconds - inspectAt < 5.10);
      }
      if (work && neck?.parent) {
        root.getWorldQuaternion(rotation);
        neck.parent.getWorldQuaternion(parentRotation).invert();
        pitchAxis.set(1, 0, 0).applyQuaternion(rotation).applyQuaternion(parentRotation);
        neck.quaternion.premultiply(bendRotation.setFromAxisAngle(pitchAxis, work.look));
      }
      if (neck && !prop) neck.rotateX((inspectEngine ? .3 : .12) * MathUtils.smoothstep(seconds, 1.3, 1.8));
    },
    stop() {
      reset();
      tool?.dispose();
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
  const handsOverLap = root.userData.longGown === true ? {
    left: [[.27, -.94, .2], [-.24, -.13, .96]],
    right: [[-.27, -.94, .2], [.24, -.13, .96]],
    leftPalm: [[-.17, -.08, .98], [-.1, -.98, -.08]],
    rightPalm: [[.17, -.08, .98], [.1, -.98, -.08]],
  } as const : undefined;
  return {
    id: SIT_IN_CHAIR, name: "Sit down", duration: 1.5,
    keys: [
      [0, {}],
      [.24, { torso: [.12, 0, 0], rise: shift.y * .12, travel: shift.z * .25, sway: shift.x * .25, turn: turn * .55 }],
      [.7, { ...sit, ...handsOverLap, rise: shift.y * .85, sway: shift.x, travel: shift.z * .9, turn }],
      [1, { ...sit, ...handsOverLap, rise: shift.y, sway: shift.x, travel: shift.z, turn }],
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
