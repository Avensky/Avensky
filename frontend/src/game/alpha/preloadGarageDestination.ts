import { useNetworkStore } from "../../store/session/networkStore";
import { useWorldStore, type MapSnapshot } from "../../store/world/worldStore";
import type { SocialWorld } from "../../store/social/socialStore";

/** world_changed clears the previous map before map_snapshot installs the new one.
 * This is the same geometry gameplay consumes; no second collider JSON download. */
async function installedSnapshot(world: SocialWorld, signal: AbortSignal): Promise<MapSnapshot> {
  const read = () => {
    const map = useWorldStore.getState().map;
    return useNetworkStore.getState().room_id === world.id && map?.map_id === world.map ? map : null;
  };
  signal.throwIfAborted();
  const existing = read();
  if (existing) return existing;
  return new Promise((resolve, reject) => {
    const abort = () => { clean(); reject(signal.reason); };
    const unsubscribe = useWorldStore.subscribe(() => {
      const map = read();
      if (map) { clean(); resolve(map); }
    });
    const timer = setTimeout(() => { clean(); reject(Error("The Harbor map did not arrive. Try Enter World again.")); }, 15000);
    const clean = () => { clearTimeout(timer); unsubscribe(); signal.removeEventListener("abort", abort); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function preloadGarageDestination(world: SocialWorld, signal: AbortSignal) {
  const [map, runtime] = await Promise.all([
    installedSnapshot(world, signal),
    import("../modes/preloadWorldApproach"),
    import("../modes/WorldContents"),
  ]);
  signal.throwIfAborted();
  runtime.preloadWorldApproach(map);
}
