import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useMenuInputDevice } from "../../components/controller/useMenuInputDevice";
import { isMobileBrowser } from "../../controls/inputDevice";
import { useNetworkStore } from "../../store/session/networkStore";
import { interactInHub, jumpInHub, releaseHubMove, setHubMove } from "./hubControls";
import { useHubStore } from "./hubStore";
import "./hubControls.css";

function MoveStick() {
  const pointer = useRef<number | null>(null);
  const [offset, setOffset] = useState([0, 0]);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointer.current) return;
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = bounds.width * .32;
    const dx = (event.clientX - bounds.left - bounds.width / 2) / radius;
    const dy = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const magnitude = Math.hypot(dx, dy);
    const normalized = Math.max(1, magnitude);
    setOffset([dx / normalized * radius, dy / normalized * radius]);
    const strength = magnitude < .12 ? 0 : 1 / normalized;
    setHubMove("touch", dx * strength, -dy * strength, magnitude > .81);
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointer.current) return;
    pointer.current = null;
    releaseHubMove("touch");
    setOffset([0, 0]);
  };
  useEffect(() => () => releaseHubMove("touch"), []);
  return <div className="hub-move-stick" role="group" aria-label="Move stick. Push farther to run."
    onPointerDown={event => {
      if (pointer.current !== null) return;
      event.preventDefault();
      pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      move(event);
    }}
    onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <span style={{ transform: `translate(${offset[0]}px, ${offset[1]}px)` }} />
  </div>;
}

export function HubHud({ drivingBrz, walking }: { drivingBrz: boolean; walking: boolean }) {
  const player = useNetworkStore(s => s.playerId);
  const grounded = useHubStore(s => s.actors[player]?.grounded ?? false);
  const target = useHubStore(s => s.selected ?? s.nearby);
  const pending = useHubStore(s => s.pending !== null);
  const notice = useHubStore(s => s.notice);
  const device = useMenuInputDevice();
  const touch = device === "touch" || isMobileBrowser();
  if (!drivingBrz && !walking) return null;
  const label = walking ? "Get in BRZ" : "Get out";
  const reachable = drivingBrz || (Boolean(target?.reachable && target.id === player) && grounded);
  return <div className="hub-controls" data-walking={walking}>
    {walking && touch && <MoveStick />}
    {walking && target && <p className="hub-target" aria-live="polite">{target.label}</p>}
    {notice && <p className="hub-notice" role="status">{notice}</p>}
    <div className="hub-actions">
      {walking && touch && <button type="button" disabled={!grounded} onClick={jumpInHub}>Jump</button>}
      {touch ? <button type="button" disabled={!reachable || pending} onClick={interactInHub}>{label}</button>
        : <p>{reachable ? `${device === "controller" ? "Y" : "F"} · ${label}` : "Walk to your parked BRZ"}</p>}
    </div>
  </div>;
}
