import { useEffect, useRef, type PointerEvent } from "react";
import { GameButton } from "../../components/GameButton";
import { ControlGlyph } from "../../components/controller/ControlGlyph";
import { useMenuInputDevice } from "../../components/controller/useMenuInputDevice";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { useGarageParking, clearParkingInput, setParkingInput } from "../preview/garageParkingStore";
import { useGarageParkingVehicle } from "../preview/garageParkingVehicle";
import "./garageDriveOverlay.css";

type Pedal = "left" | "right" | "reverse" | "forward";
const controls: Record<Pedal, { label: string; glyph: string }> = {
  left: { label: "Steer left", glyph: "◀" }, right: { label: "Steer right", glyph: "▶" },
  reverse: { label: "Reverse / brake", glyph: "▼" }, forward: { label: "Accelerate", glyph: "▲" },
};

export function GarageDriveOverlay() {
  const joining = useGarageParking(state => state.joining), error = useGarageParking(state => state.error);
  const { heroId, name, loaner } = useGarageParkingVehicle();
  const device = useMenuInputDevice();
  const held = useRef(new Map<number, Pedal>());
  // The motion wrapper remains mounted while parked. Only the driving HUD owns input.
  useEffect(() => {
    const keys = new Set<string>();
    const clear = () => { keys.clear(); held.current.clear(); clearParkingInput(); };
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      if (useGarageParking.getState().joining) {
        event.preventDefault(); event.stopImmediatePropagation();
        return;
      }
      const down = event.type === "keydown", bind = usePreferencesStore.getState().bindings;
      const code = event.code;
      if (code === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (down && !event.repeat) useGarageParking.getState().park();
        return;
      }
      if (code === "Enter" && useGarageParking.getState().error) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (down && !event.repeat) void useGarageParking.getState().depart(heroId);
        return;
      }
      if (![bind.forward, bind.reverse, bind.left, bind.right, bind.brake, bind.handbrake,
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (down) keys.add(code); else keys.delete(code);
      const pressed = (...codes: string[]) => Number(codes.some(value => keys.has(value)));
      setParkingInput("keyboard", pressed(bind.forward, "ArrowUp") - pressed(bind.reverse, "ArrowDown"),
        pressed(bind.right, "ArrowRight") - pressed(bind.left, "ArrowLeft"), pressed(bind.brake, bind.handbrake));
    };
    const menuAction = (event: Event) => { event.preventDefault(); };
    const visibility = () => { if (document.hidden) clear(); };
    const unbind = useGarageParking.subscribe((state, prev) => {
      if (state.joining && !prev.joining) clear();
    });
    window.addEventListener("avenlab:main-menu-action", menuAction);
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("avenlab:main-menu-action", menuAction);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      unbind();
      clear();
      if (useGarageParking.getState().driving) useGarageParking.getState().leave();
    };
  }, [heroId]);
  const touch = (event: PointerEvent<HTMLDivElement>, pedal?: Pedal) => {
    event.preventDefault();
    if (pedal && useGarageParking.getState().joining) return;
    if (pedal) {
      event.currentTarget.setPointerCapture(event.pointerId);
      held.current.set(event.pointerId, pedal);
    } else held.current.delete(event.pointerId);
    const active = new Set(held.current.values());
    setParkingInput("touch", Number(active.has("forward")) - Number(active.has("reverse")),
      Number(active.has("right")) - Number(active.has("left")));
  };
  const control = (pedal: Pedal) => <GameButton variant="custom" key={pedal} className="garage-drive-pedal chamfered-frame" disabled={joining}
    aria-label={controls[pedal].label} onPointerDownCapture={event => touch(event, pedal)}
    onPointerUpCapture={event => touch(event)} onPointerCancel={event => touch(event)} onLostPointerCapture={event => touch(event)}>
    <span aria-hidden="true">{controls[pedal].glyph}</span>
  </GameButton>;
  return <section className="game-ui garage-drive-hud" aria-label="Garage driving controls">
    <div className="garage-drive-status" role="status">
      {joining ? "Entering world…" : error || (loaner ? name + " · Garage loaner" : "")}
    </div>
    <div className="garage-drive-actions">
      {error && <GameButton data-garage-retry aria-label="Retry" variant="custom" className="garage-drive-action chamfered-frame" onPress={() => void useGarageParking.getState().depart(heroId)}>
        <ControlGlyph controller="A" />Retry
      </GameButton>}
      <GameButton aria-label="Park" variant="custom" className="garage-drive-action chamfered-frame" disabled={joining} onPress={() => useGarageParking.getState().park()}>
        <ControlGlyph controller="B" />Park
      </GameButton>
    </div>
    {device === "touch"
      ? <><div className="garage-drive-steering">{control("left")}{control("right")}</div>
        <div className="garage-drive-pedals">{control("reverse")}{control("forward")}</div></>
      : <div className="garage-drive-hints">
        <span><ControlGlyph controller="LS" keyboard="← →"/> Steer</span>
        <span><ControlGlyph controller="RT" keyboard="↑"/> Gas</span>
        <span><ControlGlyph controller="LT" keyboard="↓"/> Reverse</span>
      </div>}
  </section>;
}
