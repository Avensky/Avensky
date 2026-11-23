import { useCallback, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils, Vector3, type Group } from "three";
import { useShallow } from "zustand/react/shallow";
import { createWalkingDriverGeometries } from "../../vehicles/drivers/driverGeometry";
import { snapshotEntity, useNetworkStore } from "../../store/session/networkStore";
import { useCommittedResource } from "../characters/useCommittedResource";
import { useHubStore } from "./hubStore";

function Avatar({ id, geometry }: { id: string; geometry: ReturnType<typeof createWalkingDriverGeometries> }) {
  const root = useRef<Group>(null), hips = useRef<Group>(null);
  const thighs = useRef<(Group | null)[]>([]), knees = useRef<(Group | null)[]>([]);
  const shoulders = useRef<(Group | null)[]>([]), elbows = useRef<(Group | null)[]>([]);
  const phase = useRef(0);
  const destination = useRef(new Vector3());
  const posed = useRef(false);
  const driver = useNetworkStore(useShallow(s => snapshotEntity(s.snapshot, id)?.driver));
  const width = driver?.body === "male" ? .207 : .175;
  const skin = driver?.skin ?? "#bd8d72", top = driver?.top ?? "#386563", bottom = driver?.bottom ?? "#252c39";
  useFrame((_, delta) => {
    const state = useHubStore.getState().actors[id];
    if (!state || !root.current || !hips.current) return;
    const alpha = posed.current ? 1 - Math.exp(-delta * 16) : 1;
    root.current.position.lerp(destination.current.fromArray(state.feet), alpha);
    root.current.rotation.y += Math.atan2(Math.sin(state.yaw - root.current.rotation.y), Math.cos(state.yaw - root.current.rotation.y)) * alpha;
    posed.current = true;
    const movement = MathUtils.clamp(state.speed / 2.45, 0, 1);
    const run = MathUtils.smoothstep(state.speed, 2.5, 5.1);
    phase.current += (3.2 + state.speed * 1.65) * delta;
    let floor = 0;
    for (let i = 0; i < 2; i++) {
      const swing = Math.sin(phase.current + i * Math.PI) * movement;
      const thigh = state.grounded ? (.51 + .35 * run) * swing : i === 0 ? .41 : .65;
      const knee = state.grounded ? -.82 * Math.max(0, swing) * (1 + .13 * run) : -.94;
      if (thighs.current[i]) thighs.current[i]!.rotation.x = thigh;
      if (knees.current[i]) knees.current[i]!.rotation.x = knee;
      if (shoulders.current[i]) shoulders.current[i]!.rotation.x = state.grounded ? -swing * (.49 + .34 * run) : -.46;
      if (elbows.current[i]) elbows.current[i]!.rotation.x = -.13 - (state.grounded ? run * .58 : .47);
      floor = Math.max(floor, .39 * Math.cos(thigh) + .39 * Math.cos(thigh + knee));
    }
    hips.current.position.y = (state.grounded ? floor : .78) + .092;
    hips.current.rotation.x = run * .12;
  });
  return <group ref={root} name={`hub-avatar-${id}`}><group ref={hips}>
    <mesh geometry={geometry[driver?.body ?? "neutral"]} raycast={() => {}}><meshLambertMaterial color={top} /></mesh>
    <mesh position={[0, .65, -.025]} scale={[.103, .14, .10]} raycast={() => {}}>
      <sphereGeometry args={[1, 10, 7]} /><meshLambertMaterial color={skin} />
    </mesh>
    {driver?.hairStyle !== "none" && <mesh geometry={driver?.hairStyle === "long" ? geometry.longHair : geometry.shortHair} raycast={() => {}}>
      <meshLambertMaterial color={driver?.hair ?? "#2b2021"} />
    </mesh>}
    <mesh position={[0, .04, 0]} raycast={() => {}}><boxGeometry args={[.27, .16, .19]} /><meshLambertMaterial color={bottom} /></mesh>
    {[-1, 1].map((side, i) => <group key={side}>
      <group position={[side * .086, 0, 0]} ref={node => { thighs.current[i] = node; }}>
        <mesh position={[0, -.195, 0]} raycast={() => {}}><capsuleGeometry args={[.066, .29, 3, 7]} /><meshLambertMaterial color={bottom} /></mesh>
        <group position={[0, -.39, 0]} ref={node => { knees.current[i] = node; }}>
          <mesh position={[0, -.195, 0]} raycast={() => {}}><capsuleGeometry args={[.052, .29, 3, 7]} /><meshLambertMaterial color={bottom} /></mesh>
          <mesh position={[0, -.39, .049]} raycast={() => {}}><boxGeometry args={[.107, .106, .235]} /><meshLambertMaterial color="#151b22" /></mesh>
        </group>
      </group>
      <group position={[side * width, .423, -.024]} ref={node => { shoulders.current[i] = node; }}>
        <mesh position={[0, -.121, 0]} raycast={() => {}}><capsuleGeometry args={[.045, .177, 3, 7]} /><meshLambertMaterial color={top} /></mesh>
        <group position={[0, -.243, 0]} ref={node => { elbows.current[i] = node; }}>
          <mesh position={[0, -.105, 0]} raycast={() => {}}><capsuleGeometry args={[.039, .16, 3, 7]} /><meshLambertMaterial color={top} /></mesh>
          <mesh position={[0, -.236, 0]} raycast={() => {}}><sphereGeometry args={[.044, 7, 5]} /><meshLambertMaterial color={skin} /></mesh>
        </group>
      </group>
    </group>)}
  </group></group>;
}

export function HubAvatars() {
  const ids = useHubStore(useShallow(s => Object.keys(s.actors)));
  const create = useCallback(() => {
    const geometry = createWalkingDriverGeometries();
    return { geometry, dispose() { for (const item of Object.values(geometry)) item.dispose(); } };
  }, []);
  const resources = useCommittedResource(create);
  return resources ? ids.map(id => <Avatar key={id} id={id} geometry={resources.geometry} />) : null;
}
