import { useGarageParking } from "../../game/preview/garageParkingStore";
import { garageParkingVehicle } from "../../game/preview/garageParkingVehicle";
import { useHeroLoadouts } from "../../vehicles/cosmetics/heroLoadouts";
import { useGarageEditor } from "../../worldBuilder/garage/garageEditorState";
import type { StateCreator } from "zustand";
import { MAIN_MENU_ITEMS, PAUSE_MENU_ITEMS, PAUSE_RESUME_INDEX, pauseMenuRails } from "../../game/menus/menuItems";
import { canOpenVehicleSelection } from "../alpha/matchHeroChange";
import { useSelectionStore } from "../selection/selectionStore";
import { useNetworkStore } from "../session/networkStore";

import {
  isDrivingScreen,
  type MenuId,
  type MenuScreen,
  type UIOverlay,
  type UIState,
} from "./types";
let mainAdmission = 0;

const menuItemCounts: Record<MenuId, number> = {
  main: MAIN_MENU_ITEMS.length,
  pause: PAUSE_MENU_ITEMS.length,
  settings: 3,
  sandbox_setup: 4,
};

function getActiveMenu(screen: MenuScreen, overlay: UIOverlay): MenuId | null {
  if (overlay === "pause" && isDrivingScreen(screen)) return "pause";
  if (overlay !== null) return null;
  if (screen === "main") return "main";
  if (screen === "sandbox_setup") return "sandbox_setup";
  return null;
}

function nextPauseIndex(index: number, step: 1 | -1, axis: "horizontal" | "vertical") {
  const rails = pauseMenuRails(canOpenVehicleSelection());
  if (index === PAUSE_RESUME_INDEX) {
    if (axis === "horizontal") return rails[step === -1 ? 0 : 1].indices[0];
    return step === -1 ? rails[0].indices[0] : index;
  }

  const column = rails.findIndex(({ indices }) => indices.includes(index));
  const rail = rails[column];
  if (!rail) return PAUSE_RESUME_INDEX;

  const row = rail.indices.indexOf(index);
  if (axis === "horizontal") return rails[column + step]?.indices[row] ?? index;

  const nextRow = row + step;
  return nextRow === rail.indices.length ? PAUSE_RESUME_INDEX : (rail.indices[nextRow] ?? index);
}

export const createMenuActions: StateCreator<
  UIState,
  [],
  [],
  Pick<
    UIState,
    | "getActiveMenuId"
    | "getActiveMenuIndex"
    | "setActiveMenuIndex"
    | "moveActiveMenuSelection"
    | "activateActiveMenuSelection"
    | "moveActiveMenuHorizontal"
  >
> = (set, get) => ({
  getActiveMenuId: () => {
    const { screen, overlay } = get();
    return getActiveMenu(screen, overlay);
  },

  getActiveMenuIndex: () => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return 0;

    return get().selectedMenuIndexById[activeMenu] ?? 0;
  },

  setActiveMenuIndex: (index) => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu || (activeMenu === "main" && get().mainWorldJoining)) return;

    const count = menuItemCounts[activeMenu];
    const safeIndex = Math.max(0, Math.min(index, count - 1));

    if (get().selectedMenuIndexById[activeMenu] === safeIndex) return;
    set({
      ...(activeMenu === "main" ? {mainWorldError: ""} : {}),
      selectedMenuIndexById: {
        ...get().selectedMenuIndexById,
        [activeMenu]: safeIndex,
      },
    });
  },

  moveActiveMenuSelection: (dir) => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return;

    const count = menuItemCounts[activeMenu];
    const current = get().selectedMenuIndexById[activeMenu] ?? 0;
    get().setActiveMenuIndex(activeMenu === "pause"
      ? nextPauseIndex(current, dir, "vertical")
      : (current + dir + count) % count);
  },

  activateActiveMenuSelection: () => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return;

    const index = get().selectedMenuIndexById[activeMenu] ?? 0;

    if (activeMenu === "main") {
      const item = MAIN_MENU_ITEMS[index];
      if (!item || get().mainWorldJoining) return;
      if (item.id === "enter_world") {
        const request = ++mainAdmission;
        const stillJoining = () => request === mainAdmission && get().screen === "main" && get().mainWorldJoining;
        set({ mainWorldJoining: true, mainWorldError: "" });
        const { heroId } = garageParkingVehicle(useHeroLoadouts.getState().defaultHero);
        void useGarageParking.getState().startDeparture(heroId, stillJoining)
          .catch(error => {
            if (stillJoining()) set({mainWorldError: error instanceof Error ? error.message : "Could not enter the shared world."});
          })
          .finally(() => { if (stillJoining()) set({mainWorldJoining: false}); });
      } else if (item.id === "world_editor") useGarageEditor.setState({ page: "projects" });
      else get().setScreen("heroes", item.id);
      return;
    }

    if (activeMenu === "pause") {
      const item = PAUSE_MENU_ITEMS[index];
      if (item) get().setOverlay(item.id === "resume" ? null : item.id);
      return;
    }


    if (activeMenu === "sandbox_setup") {
      if (index === 0) {
        useSelectionStore.getState().nextVehicle();
        return;
      }

      if (index === 1) {
        if (useNetworkStore.getState().worldMap) return;
        useSelectionStore.getState().nextMap();
        return;
      }

      if (index === 2) {
        // The setup component owns server validation and the spawn request.
        window.dispatchEvent(new Event("avenlab:sandbox-start"));
        return;
      }

      if (index === 3) {
        window.dispatchEvent(new Event("avenlab:sandbox-exit"));
        return;
      }
    }
  },
  moveActiveMenuHorizontal: (dir) => {
    const activeMenu = get().getActiveMenuId();
    if (!activeMenu) return;

    const index = get().selectedMenuIndexById[activeMenu] ?? 0;

    if (activeMenu === "main") {
      get().moveActiveMenuSelection(dir);
      return;
    }

    if (activeMenu === "pause") {
      get().setActiveMenuIndex(nextPauseIndex(index, dir, "horizontal"));
      return;
    }


    if (activeMenu === "sandbox_setup") {
      const selection = useSelectionStore.getState();

      if (index === 0) {
        // dir === 1 ? selection.nextVehicle() : selection.prevVehicle();
        if (dir === 1) {
          selection.nextVehicle();
        } else {
          selection.prevVehicle();
        }
        return;
      }

      if (index === 1) {
        if (useNetworkStore.getState().worldMap) return;
        // dir === 1 ? selection.nextMap() : selection.nextMap();
        if (dir === 1) {
          selection.nextMap();
        } else {
          selection.prevMap();
        }
        return;
      }
    }
  },
});
