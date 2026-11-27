import { DEFAULT_GARAGE_LAYOUT, GARAGE_PARKING, type GaragePropPose, type GarageRoomLayout } from "./garageServiceLayout.ts";
import { GARAGE_ENTRY_BAY } from "./garageDoorLayout.ts";

export type GarageMenuStation = "enter_world" | "wardrobe" | "vehicle" | "world_editor";
type ParkedPosition = { x: number; z: number };
export function garageStationAnchor(station: GarageMenuStation, placement?: GaragePropPose | null, car?: ParkedPosition): readonly [number, number, number] {
  switch (station) {
    case "enter_world": return [GARAGE_ENTRY_BAY.position[0], 1.45, GARAGE_ENTRY_BAY.position[2]];
    case "vehicle": return [car?.x ?? GARAGE_PARKING.position[0], 1.22, car?.z ?? GARAGE_PARKING.position[2]];
    case "world_editor": {
      const desk = placement ?? DEFAULT_GARAGE_LAYOUT.desk;
      return [desk.x, .90, desk.z];
    }
    case "wardrobe": {
      const lockers = placement ?? DEFAULT_GARAGE_LAYOUT.lockers;
      const c = Math.cos(lockers.yaw), s = Math.sin(lockers.yaw);
      return [lockers.x + c * .32 + s * .12, 1.35, lockers.z - s * .32 + c * .12];
    }
  }
}
export function garageMenuLandmarks(layout: GarageRoomLayout, car?: ParkedPosition) {
  return {
    enter_world: garageStationAnchor("enter_world"),
    wardrobe: garageStationAnchor("wardrobe", layout.lockers),
    vehicle: garageStationAnchor("vehicle", null, car),
    world_editor: garageStationAnchor("world_editor", layout.desk),
  };
}
export const GARAGE_MENU_LANDMARKS = garageMenuLandmarks(DEFAULT_GARAGE_LAYOUT);
