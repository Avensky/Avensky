// Labels, routing and controller item counts share the same source of truth.
export const MAIN_MENU_ITEMS = [
  { id: "enter_world", icon: "open_world", label: "Enter World" },
  { id: "wardrobe", icon: "wardrobe", label: "Wardrobe" },
  { id: "vehicle", icon: "vehicles", label: "Vehicle" },
  { id: "world_editor", icon: "edit", label: "World Editor" },
] as const;

export const PAUSE_MENU_ITEMS = [
  {
    id: "resume",
    label: "Resume game",
    description: "Return to the driver's seat.",
  },
  {
    id: "debug_menu",
    label: "Debugger",
    description: "Visualizers, models and performance captures.",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Tune display, controls and accessibility.",
  },
  {
    id: "vehicle_select",
    label: "Change vehicle",
    description: "Switch your vehicle here. Shortcut: H.",
  },
  {
    id: "cockpit",
    label: "Cockpit",
    description: "Shifter, parking brake, stalks and radio. Shortcut: F4.",
  },
  {
    id: "missions",
    label: "View missions",
    description: "Review objectives and field logistics.",
  },
  {
    id: "career",
    label: "Career",
    description: "Your record, collection and favorites.",
  },
  {
    id: "leave_game",
    label: "Leave game",
    description: "Return to the main menu.",
  },
  {
    id: "social",
    label: "Worlds & social",
    description: "Your current world, teammates and invitations.",
  },
] as const;

type PauseRailItem = Exclude<(typeof PAUSE_MENU_ITEMS)[number]["id"], "resume">;

function pauseRail(label: string, ...ids: PauseRailItem[]) {
  return {
    label,
    indices: ids.map((id) => PAUSE_MENU_ITEMS.findIndex((item) => item.id === id)),
  };
}

export const PAUSE_RESUME_INDEX = PAUSE_MENU_ITEMS.findIndex((item) => item.id === "resume");
export const PAUSE_CHANGE_VEHICLE_INDEX = PAUSE_MENU_ITEMS.findIndex((item) => item.id === "vehicle_select");
export const PAUSE_MENU_RAILS = [
  { ...pauseRail("Drive", "vehicle_select", "cockpit", "settings", "debug_menu"), controller: "LB", keyboard: "Q" },
  { ...pauseRail("Session", "missions", "career", "social", "leave_game"), controller: "RB", keyboard: "E" },
] as const;

const pauseRailsWithoutVehicleSelection = PAUSE_MENU_RAILS.map(rail => ({
  ...rail, indices: rail.indices.filter(index => index !== PAUSE_CHANGE_VEHICLE_INDEX),
}));

export function pauseMenuRails(vehicleSelectionAvailable: boolean) {
  return vehicleSelectionAvailable ? PAUSE_MENU_RAILS : pauseRailsWithoutVehicleSelection;
}
