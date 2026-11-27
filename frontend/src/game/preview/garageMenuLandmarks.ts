import { GARAGE_PARKING, GARAGE_WORKSHOP } from "./garageServiceLayout.ts";
import { GARAGE_ENTRY_BAY } from "./garageDoorLayout.ts";

// World-space points in the persistent garage, shared by the props, camera and menu labels.
export const GARAGE_MENU_LANDMARKS = {
  enter_world: [GARAGE_ENTRY_BAY.position[0], 1.45, GARAGE_ENTRY_BAY.position[2]],
  wardrobe: [GARAGE_WORKSHOP.lockers.position[0] + .32, 1.35, GARAGE_WORKSHOP.lockers.position[2] + .12],
  vehicle: [GARAGE_PARKING.position[0], 1.22, GARAGE_PARKING.position[2]],
  world_editor: [GARAGE_WORKSHOP.desk.position[0], .90, GARAGE_WORKSHOP.desk.position[2]],
} as const;
export type GarageMenuStation = keyof typeof GARAGE_MENU_LANDMARKS;
