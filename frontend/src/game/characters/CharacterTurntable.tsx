import { characterTurnLocked } from "./characterPreviewStage";
import { useEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Group, MathUtils } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useCharacterPreviewStore } from "./characterPreviewStore";
import { useFittingTurnStore } from "./fittingControlsStore";

/** Pick a strand, garment or body mesh once. Its pointer keeps turning this actor across the room. */
export function CharacterTurntable({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const group = useRef<Group>(null);
  const drag = useRef<{ id: number; startX: number; x: number; y: number; travel: number; target: Element } | null>(null);
  const invalidate = useThree(s => s.invalidate);
  const connected = useThree(s => s.events.connected);
  const reduced = usePreferencesStore(s => s.reducedMotion);
  useEffect(() => {
    if (!enabled) return;
    return useFittingTurnStore.subscribe((state, previous) => {
      if (state.characterYaw !== previous.characterYaw) invalidate();
    });
  }, [enabled, invalidate]);
  useEffect(() => {
    if (!enabled || !connected) return;
    // The initial hit chose the actor. Its captured pointer can supply deltas
    // without asking Fiber to intersect every skinned mesh again on each move.
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x;
      const wasTap = current.travel <= 3;
      current.travel += Math.hypot(dx, event.clientY - current.y);
      current.x = event.clientX;
      current.y = event.clientY;
      if (current.travel <= 3) return;
      const turn = wasTap ? current.x - current.startX : dx;
      if (turn !== 0) useFittingTurnStore.setState(state => ({ characterYaw: state.characterYaw + turn * .008 }));
    };
    const release = (event?: PointerEvent) => {
      const current = drag.current;
      if (!current || (event && current.id !== event.pointerId)) return;
      drag.current = null;
      useFittingTurnStore.setState({ dragging: false, suppressClickUntil: current.travel > 3 ? performance.now() + 250 : 0 });
      if (current.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id);
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
  }, [enabled, connected]);
  useFrame((_, delta) => {
    if (!group.current) return;
    const view = useCharacterPreviewStore.getState();
    const yaw = enabled && !characterTurnLocked(view.insideCar, view.emote?.id) ? useFittingTurnStore.getState().characterYaw : 0;
    group.current.rotation.y = reduced ? yaw : MathUtils.damp(group.current.rotation.y, yaw, 18, Math.min(delta, .1));
    if (Math.abs(group.current.rotation.y - yaw) > .001) invalidate();
  }, -.75);
  const begin = (event: ThreeEvent<PointerEvent>) => {
    const view = useCharacterPreviewStore.getState();
    if (drag.current || event.button !== 0 || characterTurnLocked(view.insideCar, view.emote?.id)) return;
    if (event.pointerType === "touch" && !event.isPrimary) return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    const target = event.nativeEvent.target as Element;
    target.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, startX: event.clientX, x: event.clientX, y: event.clientY, travel: 0, target };
    useFittingTurnStore.setState({ dragging: true });
  };
  return <group ref={group} name="fitting-character-pivot" onPointerDown={enabled ? begin : undefined}>
    {children}
  </group>;
}
