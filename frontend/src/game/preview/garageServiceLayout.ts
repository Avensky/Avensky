import { GARAGE_BAY_DOORS } from "./garageDoorLayout.ts";

type FloorPlacement = { position: [number, number, number]; yaw: number };
function at(x: number, z: number, yaw = 0): FloorPlacement {
  return { position: [x, 0, z], yaw };
}

// A 2.41 × 5.81 m pickup fits here and clears both jambs on a straight departure.
// The rack's lower tubes and wiring stop at X=-4.46 below vehicle roof level.
export const GARAGE_PARKING = at(GARAGE_BAY_DOORS[0].position[0] + .10, .80);
export const GARAGE_WORKSHOP = {
  lockers: at(-4.97, -5.72),
  desk: at(6.75, -3.98, -Math.PI / 2),
  shelf: at(7.50, -5.48, -Math.PI / 2),
  toolbox: at(-1.46, -.24, Math.PI / 2),
  tire: at(-1.48, -1.23, Math.PI / 2),
  jack: at(-1.47, 1.90, .31),
  crane: { ...at(-5.55, 4.64, Math.PI / 2), scale: .85 },
};

export type GarageParkingObstacle = {
  x: number; z: number; halfWidth: number; halfLength: number; yaw?: number;
};

function footprint({ position: [x, , z], yaw }: FloorPlacement, width: number, depth: number): GarageParkingObstacle {
  return { x, z, halfWidth: width / 2, halfLength: depth / 2, yaw };
}

// Footprints are in the same floor coordinates as the rendered props, with no duplicate physics meshes.
export const GARAGE_PARKING_OBSTACLES: readonly GarageParkingObstacle[] = [
  footprint(GARAGE_WORKSHOP.toolbox, .90, .66),
  footprint(GARAGE_WORKSHOP.tire, .67, .22),
  footprint(GARAGE_WORKSHOP.jack, .26, .84),
  footprint(GARAGE_WORKSHOP.crane, 1.372 * GARAGE_WORKSHOP.crane.scale, 2.383 * GARAGE_WORKSHOP.crane.scale),
  footprint(GARAGE_WORKSHOP.shelf, 1.18, .42),
  // Locker bank, mirror and changing bench span one continuous strip of rear wall.
  footprint(at(GARAGE_WORKSHOP.lockers.position[0] + .70, GARAGE_WORKSHOP.lockers.position[2] + .08), 2.55, 1.08),
  // The table, stool and map partition share the corner. Guard their outside perimeter.
  footprint(at(GARAGE_WORKSHOP.desk.position[0] + .48, GARAGE_WORKSHOP.desk.position[2] + .03), 2.22, 2.05),
  // Fixed authored fixtures measured at vehicle height: rack, work lamp and three support columns.
  footprint(at(-5.26, 0), 1.60, 7.60),
  footprint(at(3.47, -4.15), 1.45, 1.58),
  footprint(at(-6.33, -6.12), 1.54, 1.54),
  footprint(at(6.46, -6.12), 1.54, 1.54),
  footprint(at(-6.33, 6.39), 1.54, 1.54),
];
