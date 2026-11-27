import { HEROES, useAlphaStore } from "../../store/alpha/alphaStore";
import { useWorldCatalog } from "../../store/selection/worldCatalog";
import { useSelectionStore } from "../../store/selection/selectionStore";
import { useSocialStore } from "../../store/social/socialStore";
import { admitOpenWorld } from "../social/navigation";
import { deploySelectedHero } from "./sessionActions";

/** Keep the garage visible until the Harbor confirms the car the player just drove through the door. */
export async function driveIntoOpenWorld(heroId: string, stillJoining: () => boolean) {
  if (!HEROES.some(hero => hero.id === heroId)) throw Error("Choose an available garage vehicle.");
  const player = useSocialStore.getState().view?.profile;
  const current = () => {
    const profile = useSocialStore.getState().view?.profile;
    return stillJoining() && !!player && player.id === profile?.id &&
      player.active_character_id === profile.active_character_id;
  };
  const world = await admitOpenWorld(stillJoining);
  if (!world || !current()) return;
  const mapIndex = useWorldCatalog.getState().maps.findIndex(map => map.id === world.map);
  if (mapIndex < 0) throw Error("The Harbor map is unavailable in this client.");
  useAlphaStore.getState().chooseMode("sandbox");
  useSelectionStore.setState({ mapIndex });
  useAlphaStore.getState().chooseHero(heroId);
  await deploySelectedHero({ worldId: world.id, map: world.map, current });
}
