import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Raycaster, Vector2, Vector3, type Group, type Object3D } from "three";
import { useNetworkStore, type PhysicsEntitySnapshot } from "../../store/session/networkStore";
import { canDrive } from "../../controls/inputRouting";
import { getHubCameraYaw, setHubCameraYaw, turnHubCamera } from "./hubControls";
import { updateHubTarget, useHubStore, type HubTarget } from "./hubStore";
import { canReachHubCar, pickHubCar } from "./hubTargeting";

function carTarget(car: PhysicsEntitySnapshot, feet: number[]): HubTarget {
  return { id: car.id, label: car.vehicle_id === "brz" ? "BRZ" : (car.vehicle_id ?? "Vehicle").toUpperCase(),
    kind: "vehicle", reachable: canReachHubCar(feet, car) };
}

function pickableObject(object: Object3D) {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (typeof node.userData.interactionLabel === "string") return { node, label: node.userData.interactionLabel };
  }
  if (object.name && !/ground|floor|road|terrain|collider|marker|sky|^mesh/i.test(object.name))
    return { node: object, label: object.name.replaceAll("_", " ").slice(0, 50) };
}

export function HubCamera({ player }: { player: string }) {
  const { gl, camera, scene } = useThree();
  const aim = useRef(new Vector3()), eye = useRef(new Vector3()), targetPosition = useRef(new Vector3());
  const lookOffset = useRef(new Vector3());
  const ray = useRef(new Raycaster()), ndc = useRef(new Vector2());
  const marker = useRef<Group>(null);
  const started = useRef(false), elapsed = useRef(0);
  useEffect(() => {
    let pointer: { id: number; x: number; y: number; travel: number } | undefined;
    const down = (event: PointerEvent) => {
      if (!canDrive() || pointer || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0 };
      gl.domElement.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id || !canDrive()) return;
      const dx = event.clientX - pointer.x;
      pointer.travel += Math.hypot(dx, event.clientY - pointer.y);
      if (pointer.travel > 6) turnHubCamera(-dx * .009);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const tap = event.type === "pointerup" && pointer.travel < 6 && canDrive();
      pointer = undefined;
      if (!tap) return;
      const actor = useHubStore.getState().actors[player];
      if (!actor) return;
      const bounds = gl.domElement.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      ndc.current.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
      ray.current.setFromCamera(ndc.current, camera);
      const chosen = pickHubCar(ray.current.ray, useNetworkStore.getState().snapshot?.entities ?? []);
      if (chosen) {
        updateHubTarget("selected", carTarget(chosen.car, actor.feet));
        return;
      }
      // Props are inspected on taps only. Continuous targeting uses the compact car bounds.
      ray.current.far = 12;
      const hit = ray.current.intersectObjects(scene.children, true).find(item => item.object.visible);
      const object = hit && pickableObject(hit.object);
      updateHubTarget("selected", object ? { id: object.node.uuid, label: object.label, kind: "object", reachable: false } : null);
    };
    const bounds = gl.domElement;
    bounds.addEventListener("pointerdown", down);
    bounds.addEventListener("pointermove", move);
    bounds.addEventListener("pointerup", up);
    bounds.addEventListener("pointercancel", up);
    bounds.addEventListener("lostpointercapture", up);
    return () => {
      bounds.removeEventListener("pointerdown", down);
      bounds.removeEventListener("pointermove", move);
      bounds.removeEventListener("pointerup", up);
      bounds.removeEventListener("pointercancel", up);
      bounds.removeEventListener("lostpointercapture", up);
    };
  }, [camera, gl, player, scene]);
  useFrame(({ camera }, delta) => {
    const hub = useHubStore.getState(), actor = hub.actors[player];
    if (!actor) return;
    if (!started.current) {
      setHubCameraYaw(actor.yaw);
      started.current = true;
      aim.current.fromArray(actor.feet).addScaledVector(camera.up, 1.06);
      eye.current.copy(aim.current).add(lookOffset.current.set(-Math.sin(actor.yaw) * 4.8, 2.0, -Math.cos(actor.yaw) * 4.8));
    }
    const yaw = getHubCameraYaw();
    const speed = 1 - Math.exp(-delta * 12);
    aim.current.lerp(targetPosition.current.fromArray(actor.feet).addScaledVector(camera.up, 1.04), speed);
    eye.current.lerp(targetPosition.current.copy(aim.current).add(lookOffset.current.set(-Math.sin(yaw) * 4.8, 2.0, -Math.cos(yaw) * 4.8)), speed);
    camera.position.copy(eye.current);
    camera.lookAt(aim.current);

    const vehicles = useNetworkStore.getState().snapshot?.entities ?? [];
    const target = hub.selected?.kind === "vehicle" ? hub.selected : hub.selected ? null : hub.nearby;
    const car = target && vehicles.find(row => row.id === target.id);
    if (marker.current) {
      marker.current.visible = Boolean(car);
      if (car) {
        marker.current.position.fromArray(car.position);
        marker.current.position.y -= .22;
      }
    }
    elapsed.current += delta;
    if (elapsed.current < .1) return;
    elapsed.current = 0;
    if (hub.selected?.kind === "vehicle") updateHubTarget("selected", car ? carTarget(car, actor.feet) : null);
    ray.current.ray.origin.fromArray(actor.feet).addScaledVector(camera.up, .66);
    ray.current.ray.direction.set(Math.sin(yaw), 0, Math.cos(yaw));
    const aimed = pickHubCar(ray.current.ray, vehicles, 5);
    const own = vehicles.find(row => row.id === player && row.vehicle_id === "brz");
    const nearby = aimed?.car ?? (own && canReachHubCar(actor.feet, own) ? own : undefined);
    updateHubTarget("nearby", nearby ? carTarget(nearby, actor.feet) : null);
  }, -1);
  return <group ref={marker} visible={false} name="hub-selected-vehicle">
    <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <ringGeometry args={[1.25, 1.31, 36]} /><meshBasicMaterial color="#81e6c9" transparent opacity={.78} depthWrite={false} />
    </mesh>
  </group>;
}
