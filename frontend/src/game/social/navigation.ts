import { requestSocial } from "../../net/socialClient";
import { currentOpenWorld } from "./openWorld";
import { useSelectionStore } from "../../store/selection/selectionStore";
import { refreshInstalledWorlds, useWorldCatalog } from "../../store/selection/worldCatalog";
import { useUIStore } from "../../store/menus/uiStore";
import { useAlphaStore } from "../../store/alpha/alphaStore";
import { useSocialStore } from "../../store/social/socialStore";

/** The existing garage remains the sole owner of the selected vehicle/spawn. */
export function enterWorld(result: Record<string, unknown>, mode?: "sandbox") {
  const index = useWorldCatalog.getState().maps.findIndex((map) => map.id === result.map);
  if (index < 0)
    throw new Error(
      "This world uses a map that is unavailable in this client.",
    );
  const view = useSocialStore.getState().view;
  const world = view?.worlds.find(
    (world) => world.id === (result.world_id ?? view.current_world_id),
  );
  if (mode) useAlphaStore.getState().chooseMode(mode);
  else if (world) useAlphaStore.getState().chooseMode(world.mode ?? "sandbox");
  else if (view?.alpha?.active)
    useAlphaStore.getState().chooseMode(view.alpha.active.mode);
  else useAlphaStore.getState().chooseMode("sandbox");
  useSelectionStore.setState({ mapIndex: index });
  useUIStore.getState().setScreen("hero_select");
}

/** Admission always targets the server's designated shared hub. The caller can
 * invalidate a pending request if the profile or visible menu is replaced. */
export async function admitOpenWorld(stillJoining: () => boolean) {
  const player = useSocialStore.getState().view?.profile;
  if (!player) throw Error("Connect your player profile to enter the shared world.");
  const currentView = () => {
    const view = useSocialStore.getState().view;
    if (view?.profile.id !== player.id || view.profile.active_character_id !== player.active_character_id)
      throw Error("Your player session changed. Choose your character again.");
    return view;
  };
  await refreshInstalledWorlds();
  if (!stillJoining()) return;
  const view = currentView();
  const world = currentOpenWorld(view);
  if (!world) throw Error("No Open World hub is available.");
  if (!useWorldCatalog.getState().maps.some(map => map.id === world.map))
    throw Error("The Open World map is unavailable in this client.");
  const joined = view.current_world_id === world.id
    ? { world_id: world.id, map: world.map }
    : await requestSocial("world_join", { world_id: world.id });
  if (!stillJoining()) return;
  currentView();
  if (joined.world_id !== world.id || joined.map !== world.map)
    throw Error("The server assigned a different world. Return to the garage and try again.");
  return world;
}

export async function joinOpenWorld(stillJoining = () => true) {
  const world = await admitOpenWorld(stillJoining);
  if (!world || !stillJoining()) return;
  useAlphaStore.getState().clearHero();
  // The public hub uses the free-drive vehicle policy, even when the
  // admission acknowledgment precedes a previous match's social update.
  enterWorld({ world_id: world.id, map: world.map }, "sandbox");
}
