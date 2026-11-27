export type MenuScreen =
  | "loading"
  | "welcome"
  | "main"
  | "heroes"
  | "mode_select"
  | "hero_select"
  | "queue"
  | "world_builder"
  | "sandbox_setup"
  | "sandbox"
  | "settings"
  | "vehicle_select"
  | "career"
  | "missions"
  | "social";

export type UIOverlay =
  | "survey_map"
  | "match_results"
  | "team_lineup"
  | "hero_abilities"
  | null
  | "pause"
  | "debug_menu"
  | "settings"
  | "vehicle_select"
  | "career"
  | "missions"
  | "leave_game"
  | "cockpit"
  | "world_builder"
  | "social";
export type CockpitTab =
  | "turret"
  | "brightness"
  | "climate"
  | "drive"
  | "lights"
  | "wipers"
  | "cruise"
  | "radio"
  | "vehicle"
  | "console"
  | "ignition"
  | "navigation"
  | "missions";

export type MenuId =
  | "main"
  | "pause"
  | "settings"
  | "sandbox_setup";

// Only Sandbox owns driving controls and the in-game pause stack.
export const isDrivingScreen = (screen: MenuScreen) => screen === "sandbox";

export type SignalMission = {
  id: string;
  title: string;
  target: string;
  status: string;
};

export type UIState = {
  missionLogParent: "cockpit" | "pause" | null;
  settingsTab: string;
  settingsParent: "cockpit" | "debug_menu" | null;
  openSettings: (tab?: string) => void;
  cockpitTab: CockpitTab;
  setCockpitTab: (tab: CockpitTab) => void;
  openCockpit: (tab?: CockpitTab) => void;
  screen: MenuScreen;
  workshopEntry: "wardrobe" | "vehicle" | null;
  heroSelectionParent: "main" | "mode_select";
  mainWorldJoining: boolean;
  mainWorldError: string;
  welcomeSection: "account" | null;
  setScreen: { (screen: MenuScreen): void; (screen: "welcome", section: "account"): void; (screen: "heroes", section: "wardrobe" | "vehicle"): void };

  overlay: UIOverlay;
  setOverlay: (overlay: UIOverlay) => void;
  vehicleSelectionParent: "pause" | "team_lineup" | null;
  openVehicleSelection: () => void;
  debugMenuParent: "pause" | null;
  toggleDebugMenu: () => void;

  selectedMenuIndexById: Record<MenuId, number>;

  isModeLoading: boolean;
  startModeLoading: (screen: MenuScreen, label?: string) => void;

  loadingLabel: string;
  finishModeLoading: () => void;

  loadingProgress: number;
  setLoadingProgress: (value: number) => void;

  getActiveMenuId: () => MenuId | null;
  getActiveMenuIndex: () => number;
  setActiveMenuIndex: (index: number) => void;

  moveActiveMenuSelection: (dir: 1 | -1) => void;
  activateActiveMenuSelection: () => void;

  openPause: () => void;
  closeOverlay: () => void;
  backToParentMenu: () => void;
  togglePauseMenu: () => void;

  moveActiveMenuHorizontal: (dir: 1 | -1) => void;

  selectedMission: SignalMission | null;
  setSelectedMission: (mission: SignalMission | null) => void;
};
