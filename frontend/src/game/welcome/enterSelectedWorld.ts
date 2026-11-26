import { useUIStore } from "../../store/menus/uiStore";
import { useSocialStore } from "../../store/social/socialStore";
import { currentOpenWorld } from "../social/openWorld";

export async function enterSelectedWorld() {
  const view = useSocialStore.getState().view;
  if (!currentOpenWorld(view)) {
    useUIStore.getState().setScreen("main");
    return;
  }
  const { joinOpenWorld } = await import("../alpha/sessionActions");
  if (useUIStore.getState().screen === "welcome" && useSocialStore.getState().view?.profile.id === view?.profile.id)
    await joinOpenWorld();
}
