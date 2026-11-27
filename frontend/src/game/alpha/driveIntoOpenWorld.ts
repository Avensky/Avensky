import { HEROES, useAlphaStore } from "../../store/alpha/alphaStore";
import { useWorldCatalog } from "../../store/selection/worldCatalog";
import { useNetworkStore } from "../../store/session/networkStore";
import { useWorldStore } from "../../store/world/worldStore";
import { useSelectionStore } from "../../store/selection/selectionStore";
import { useSocialStore } from "../../store/social/socialStore";
import { admitOpenWorld } from "../social/navigation";
import { garageAdmission } from "../social/garageAdmission";
import { preloadGarageDestination } from "./preloadGarageDestination";
import { deploySelectedHero } from "./sessionActions";

/** Keep the garage visible until the Harbor confirms the car the player just drove through the door. */
type GarageCinematic = { signal: AbortSignal; outside: Promise<void>; commit: () => void };
export async function driveIntoOpenWorld(heroId: string, stillJoining: () => boolean, cinematic?: GarageCinematic) {
  if (!HEROES.some(hero => hero.id === heroId)) throw Error("Choose an available garage vehicle.");
  const player = useSocialStore.getState().view?.profile;
  const current = () => {
    const profile = useSocialStore.getState().view?.profile;
    return stillJoining() && !!player && player.id === profile?.id &&
      player.active_character_id === profile.active_character_id;
  };
  const lease = cinematic ? garageAdmission(cinematic.signal) : undefined;
  let entered = false;
  try {
    const [world] = await Promise.all([
      admitOpenWorld(stillJoining, cinematic ? world => preloadGarageDestination(world, cinematic.signal) : undefined, lease?.join),
      cinematic?.outside,
    ]);
    if (!world) return;
    const inDestination = () => {
      if (!current()) return false;
      if (cinematic && (useNetworkStore.getState().room_id !== world.id || useWorldStore.getState().map?.map_id !== world.map))
        throw Error("Your Harbor session changed. Try Enter World again.");
      return true;
    };
    if (!inDestination()) return;
    const mapIndex = useWorldCatalog.getState().maps.findIndex(map => map.id === world.map);
    if (mapIndex < 0) throw Error("The Harbor map is unavailable in this client.");
    useAlphaStore.getState().chooseMode("sandbox");
    useSelectionStore.setState({ mapIndex });
    useAlphaStore.getState().chooseHero(heroId);
    cinematic?.commit();
    entered = await deploySelectedHero({ worldId: world.id, map: world.map, current: inDestination, ticket: lease?.ticket }) === true;
  } finally {
    lease?.finish(entered);
  }
}
