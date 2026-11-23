import { create } from "zustand";

export type HubActor = { id: string; feet: [number, number, number]; yaw: number; speed: number; grounded: boolean };
export type HubTarget = { id: string; label: string; kind: "vehicle" | "object"; reachable: boolean };
type HubState = {
  world: number | null;
  tick: number;
  actors: Readonly<Record<string, HubActor>>;
  selected: HubTarget | null;
  nearby: HubTarget | null;
  pending: number | null;
  notice: string | null;
};
const empty: HubState = { world: null, tick: -1, actors: {}, selected: null, nearby: null, pending: null, notice: null };
export const useHubStore = create<HubState>(() => empty);
export const hubEnabled = import.meta.env?.MODE === "staging";

export function resetHub() {
  useHubStore.setState(empty);
}

export function receiveHubActors(message: Record<string, unknown>, room: number | null | undefined) {
  const { world_id: world, tick, actors } = message;
  if (!hubEnabled || typeof world !== "number" || world !== room || typeof tick !== "number" ||
      !Array.isArray(actors)) return;
  const previous = useHubStore.getState();
  if (previous.world === world && previous.tick > tick) return;
  const rows: Record<string, HubActor> = {};
  for (const entry of actors) {
    if (!entry || typeof entry.id !== "string" || !Array.isArray(entry.feet) || entry.feet.length !== 3 ||
      !entry.feet.every(Number.isFinite) || !Number.isFinite(entry.yaw) || !Number.isFinite(entry.speed) ||
      typeof entry.grounded !== "boolean") continue;
    rows[entry.id] = entry;
  }
  useHubStore.setState(previous.world === world ? { tick, actors: rows } : { ...empty, world, tick, actors: rows });
}

export function updateHubTarget(kind: "selected" | "nearby", target: HubTarget | null) {
  const previous = useHubStore.getState()[kind];
  if (previous?.id === target?.id && previous?.reachable === target?.reachable) return;
  useHubStore.setState({ [kind]: target });
}
