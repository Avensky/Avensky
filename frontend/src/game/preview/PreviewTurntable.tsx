import { useFittingTurnStore } from "../characters/fittingControlsStore";
import { createContext, useContext, useMemo, useEffect, useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { DoubleSide, Group, MathUtils, Vector3, type Box3 } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";

type TurntableDrag = (event: ThreeEvent<PointerEvent>) => void;
const VehicleDrag = createContext<TurntableDrag | undefined>(undefined);

/** Pick the already-measured hull once on press, independently of its displayed LOD. */
export function VehicleDragVolume({ bounds }: { bounds: Box3 }) {
  const begin = useContext(VehicleDrag);
  const [center, size] = useMemo(() => [bounds.getCenter(new Vector3()), bounds.getSize(new Vector3())], [bounds]);
  return begin && !bounds.isEmpty() ? <mesh name="vehicle-inspection-drag" visible={false}
    position={center} scale={size} onPointerDown={begin}><boxGeometry /></mesh> : null;
}

export function PreviewTurntable({
  children,
  onReady,
  spin = true,
  locked = false,
  restoreAngle = false,
  inspectExterior = false,
}: {
  children: ReactNode;
  onReady: (group: Group | null) => void;
  spin?: boolean;
  locked?: boolean;
  restoreAngle?: boolean;
  inspectExterior?: boolean;
}) {
  const group = useRef<Group>(null);
  const angle = useRef(0);
  const drag = useRef<{ pointerId: number; clientX: number; target: Element } | null>(null);
  const connected = useThree(s => s.events.connected);
  const attach = useCallback(
    (object: Group | null) => {
      group.current = object;
      onReady(object);
    },
    [onReady],
  );
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion);
  const cameraSensitivity = usePreferencesStore((s) => s.cameraSensitivity);
  const invalidate = useThree(s => s.invalidate);

  useLayoutEffect(() => {
    const object = group.current;
    if (!restoreAngle || !object) return;
    const parkedAngle = angle.current, renderedAngle = object.rotation.y;
    return () => {
      angle.current = parkedAngle;
      object.rotation.y = renderedAngle;
    };
  }, [restoreAngle]);
  useFrame(({ frameloop }, delta) => {
    if (!group.current) return;
    const step = Math.min(delta, 0.1);
    if (locked) return;
    if (spin && !reducedMotion && !drag.current && frameloop !== "never") angle.current += step * 0.035;
    const rotation = group.current.rotation;
    if (reducedMotion || Math.abs(rotation.y - angle.current) < .0005) rotation.y = angle.current;
    else {
      rotation.y = MathUtils.damp(rotation.y, angle.current, 22, step);
      if (frameloop === "demand" && Math.abs(rotation.y - angle.current) > .004) invalidate();
    }
  }, -1);

  const beginDrag = (event: ThreeEvent<PointerEvent>) => {
    if (locked || drag.current || event.button !== 0 || useFittingTurnStore.getState().dragging) return;
    event.stopPropagation();
    const target = event.nativeEvent.target as Element;
    target.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, clientX: event.clientX, target };
  };
  useEffect(() => {
    if (locked || !connected) return;
    const move = (event: PointerEvent) => {
      const pointer = drag.current;
      if (pointer?.pointerId !== event.pointerId) return;
      angle.current += (event.clientX - pointer.clientX) * cameraSensitivity * .006;
      pointer.clientX = event.clientX;
      invalidate();
    };
    const release = (event?: PointerEvent) => {
      const pointer = drag.current;
      if (!pointer || event && pointer.pointerId !== event.pointerId) return;
      drag.current = null;
      if (pointer.target.hasPointerCapture(pointer.pointerId)) pointer.target.releasePointerCapture(pointer.pointerId);
    };
    connected.addEventListener("pointermove", move);
    connected.addEventListener("pointerup", release);
    connected.addEventListener("pointercancel", release);
    connected.addEventListener("lostpointercapture", release);
    return () => {
      connected.removeEventListener("pointermove", move);
      connected.removeEventListener("pointerup", release);
      connected.removeEventListener("pointercancel", release);
      connected.removeEventListener("lostpointercapture", release);
      release();
    };
  }, [connected, locked, cameraSensitivity, invalidate]);

  // Exterior inspection reserves the room for orbit. Other previews keep their existing floor drag.
  return (
    <group ref={attach} name="vehicle-turntable">
      <VehicleDrag.Provider value={inspectExterior && !locked ? beginDrag : undefined}>{children}</VehicleDrag.Provider>
      {!inspectExterior && !locked && <mesh
        name="vehicle-turntable-drag-surface"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.065, 0]}
        onPointerDown={beginDrag}
      >
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial visible={false} side={DoubleSide} />
      </mesh>}
    </group>
  );
}
