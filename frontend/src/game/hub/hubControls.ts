import { canDrive } from "../../controls/inputRouting";
import { socket } from "../../net/rustSocket";
import { useInputStore } from "../../store/input/inputStore";
import { useNetworkStore } from "../../store/session/networkStore";
import { hubEnabled, useHubStore } from "./hubStore";

type Device = "keyboard" | "gamepad" | "touch";
const intent = new Map<Device, { x: number; z: number; run: boolean }>();
let jump = 0;
let lastMotion = 0;
let request = 0;
let cameraYaw = 0;

export function hubMode(): "foot" | "brz" | null {
  if (!hubEnabled) return null;
  const connection = useNetworkStore.getState(), hub = useHubStore.getState();
  if (!connection.connected || hub.world === null || hub.world !== connection.room_id) return null;
  if (connection.playerId && hub.actors[connection.playerId]) return "foot";
  return connection.getMe()?.vehicle_id === "brz" ? "brz" : null;
}

export function setHubMove(device: Device, x: number, z: number, run = false) {
  if (x || z) intent.set(device, { x, z, run });
  else intent.delete(device);
}
export function releaseHubMove(device?: Device) {
  if (device) intent.delete(device);
  else intent.clear();
}
export function resetHubControls() {
  releaseHubMove();
  jump = 0;
  lastMotion = 0;
  cameraYaw = 0;
}
export function jumpInHub() { if (hubMode() === "foot" && canDrive()) jump = (jump + 1) >>> 0; }
export function setHubCameraYaw(yaw: number) { cameraYaw = yaw; }
export function turnHubCamera(amount: number) { cameraYaw += amount; }
export function getHubCameraYaw() { return cameraYaw; }

export function hubMotion(x: number, z: number, yaw: number) {
  const magnitude = Math.max(1, Math.hypot(x, z));
  return { x: (Math.sin(yaw) * z - Math.cos(yaw) * x) / magnitude,
    z: (Math.cos(yaw) * z + Math.sin(yaw) * x) / magnitude };
}

/** Return true while on foot so the normal input clock never feeds the parked car. */
export function sendHubMotion(connection: WebSocket, now: number, forceNeutral: boolean) {
  if (hubMode() !== "foot") return false;
  if (!forceNeutral && now - lastMotion < 49) return true;
  const world = useHubStore.getState().world;
  const active = forceNeutral || !canDrive() || document.visibilityState === "hidden" ? undefined : [...intent.values()].at(-1);
  const motion = hubMotion(active?.x ?? 0, active?.z ?? 0, cameraYaw);
  connection.send(JSON.stringify({ type: "hub_motion", world_id: world, ...motion, run: active?.run ?? false, jump }));
  lastMotion = now;
  return true;
}

export function interactInHub() {
  const mode = hubMode();
  const hub = useHubStore.getState();
  if (!mode || !canDrive() || hub.pending !== null || !socket || socket.readyState !== WebSocket.OPEN) return;
  const target = hub.selected ?? hub.nearby;
  const player = useNetworkStore.getState().playerId;
  if (mode === "foot" && (target?.id !== player || !target.reachable)) {
    useHubStore.setState(state => ({ notice: "Select your parked BRZ and stand beside its door.", noticeRevision: state.noticeRevision + 1 }));
    return;
  }
  const id = ++request;
  releaseHubMove();
  useInputStore.getState().releaseControls();
  useHubStore.setState({ pending: id, notice: null });
  socket.send(JSON.stringify({ type: "hub_interact", world_id: hub.world, request: id, target: mode === "foot" ? target?.id : null }));
  window.setTimeout(() => {
    if (useHubStore.getState().pending === id) useHubStore.setState({ pending: null, notice: "Try again when the BRZ is stopped." });
  }, 1500);
}

export function receiveHubResult(message: Record<string, unknown>) {
  const state = useHubStore.getState();
  if (!hubEnabled || state.world === null || state.world !== message.world_id || state.pending !== message.request) return;
  releaseHubMove();
  if (message.walking === true) { jump = 0; lastMotion = 0; }
  useInputStore.getState().releaseControls();
  useHubStore.setState({ pending: null, selected: null, nearby: null,
    notice: typeof message.message === "string" ? message.message : null });
}
