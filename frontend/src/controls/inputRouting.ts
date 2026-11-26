import {useNetworkStore} from '../store/session/networkStore';
import { useGameStore } from "../store/presentation/gameStore";
import { isDrivingScreen, useUIStore } from "../store/menus/uiStore";
import { performanceOverlayHasFocus } from "../performance/performanceOverlayStore";
import { useTextKeyboardStore } from "../store/text/keyboardStore";

export type MenuAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "activate"
  | "back"
  | "previous_tab"
  | "next_tab"
  | "previous_option"
  | "next_option";

const MENU_KEYS: Partial<Record<string, MenuAction>> = {
  ArrowUp: "up",
  Numpad8: "up",
  KeyW: "up",
  ArrowDown: "down",
  Numpad2: "down",
  KeyS: "down",
  ArrowLeft: "left",
  Numpad4: "left",
  KeyA: "left",
  ArrowRight: "right",
  Numpad6: "right",
  KeyD: "right",
  Enter: "activate",
  Space: "activate",
  Escape: "back",
  KeyQ: "previous_tab",
  KeyE: "next_tab",
  PageUp: "previous_tab",
  PageDown: "next_tab",
  Digit1: "previous_option",
  Digit3: "next_option",
  Numpad1: "previous_option",
  Numpad3: "next_option",
};

export function menuActionForKey(event: Pick<KeyboardEvent, "key" | "code">) {
  const physical = event.code || (/^[a-z]$/i.test(event.key) ? `Key${event.key.toUpperCase()}` : event.key);
  return MENU_KEYS[physical];
}

// The welcome screen owns several independent menus. Registering the visible
// form lets the gamepad check stick ownership without a DOM query per frame.
let welcomeMenuPanel: HTMLElement | null = null;
export function bindWelcomeMenuPanel(panel: HTMLElement) {
  welcomeMenuPanel = panel;
  return () => { if (welcomeMenuPanel === panel) welcomeMenuPanel = null; };
}

export function welcomeUsesMenuStick() {
  return welcomeMenuPanel !== null;
}

export function hasSecondaryMenuControls(ui: ReturnType<typeof useUIStore.getState>) {
  if (ui.overlay) return ui.overlay === "match_results";
  if (ui.screen === "mode_select") return true;
  return ui.screen === "welcome" && Boolean(welcomeMenuPanel?.querySelector("[data-creator-channel]"));
}

export function canDrive() {
  const ui = useUIStore.getState();
  return (
    !useNetworkStore.getState().getMe()?.health?.defeated &&
    useNetworkStore.getState().snapshot?.match_state?.phase !== "ended" &&
    !useTextKeyboardStore.getState().session &&
    !useGameStore.getState().editor &&
    isDrivingScreen(ui.screen) &&
    ui.overlay === null &&
    !ui.isModeLoading &&
    !performanceOverlayHasFocus()
  );
}

export function canNavigateMenu() {
  if (useTextKeyboardStore.getState().session) return true;
  if (performanceOverlayHasFocus()) return true;
  const ui = useUIStore.getState();
  const panel = ui.overlay ?? ui.screen;
  return (
    !ui.isModeLoading &&
    (ui.getActiveMenuId() !== null || panel === "survey_map" ||
      [
        "debug_menu",
        "settings",
        "hero_abilities",
        "match_results",
        "team_lineup",
        "career",
        "missions",
        "vehicle_select",
        "leave_game",
        "cockpit",
        "world_builder",
        "social",
        "hero_select",
      "heroes",
        "mode_select",
        "welcome",
        "queue",
      ].includes(panel))
  );
}

export function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

export function routeMenuAction(action: MenuAction) {
  if (action === "previous_option" || action === "next_option") {
    const ui = useUIStore.getState();
    if (!hasSecondaryMenuControls(ui) || useTextKeyboardStore.getState().session) return;
  }
  if (useTextKeyboardStore.getState().session) {
    window.dispatchEvent(
      new CustomEvent<MenuAction>("avenlab:keyboard-action", {
        detail: action,
      }),
    );
    return;
  }
  if (performanceOverlayHasFocus()) {
    window.dispatchEvent(
      new CustomEvent<MenuAction>("avenlab:performance-action", {
        detail: action,
      }),
    );
    return;
  }
  const ui = useUIStore.getState();
  if (!canNavigateMenu()) return;
  if(ui.overlay==="survey_map"){ if(action==="back"||action==="activate")ui.closeOverlay(); return; }
  const panel = ui.overlay ?? ui.screen;
  if (panel === "main" && !window.dispatchEvent(new CustomEvent<MenuAction>("avenlab:main-menu-action", { detail: action, cancelable: true }))) return;
  if (
    [
      "debug_menu",
      "settings",
      "hero_abilities",
      "match_results",
      "team_lineup",
      "career",
      "missions",
      "vehicle_select",
      "leave_game",
      "cockpit",
      "world_builder",
      "social",
      "hero_select",
      "heroes",
      "mode_select",
      "welcome",
      "queue",
    ].includes(panel)
  ) {
    window.dispatchEvent(
      new CustomEvent<MenuAction>("avenlab:panel-action", { detail: action }),
    );
    return;
  }
  if (action === "previous_tab" || action === "next_tab") {
    if (panel === "pause") ui.moveActiveMenuHorizontal(action === "previous_tab" ? -1 : 1);
    return;
  }
  if (action === "up" || action === "down")
    ui.moveActiveMenuSelection(action === "up" ? -1 : 1);
  else if (action === "left" || action === "right")
    ui.moveActiveMenuHorizontal(action === "left" ? -1 : 1);
  else if (action === "activate") ui.activateActiveMenuSelection();
  else if (ui.overlay !== null) ui.closeOverlay();
  else if (ui.screen === "sandbox_setup")
    window.dispatchEvent(new Event("avenlab:sandbox-exit"));
  else if (ui.screen === "settings") ui.setScreen("main");
}
