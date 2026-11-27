import { GARAGE_BAY_DOORS } from "./garageDoorLayout.ts";

export const GARAGE_PROP_IDS = ["lockers", "desk", "shelf", "toolbox", "jack", "crane"] as const;
export type GaragePropId = typeof GARAGE_PROP_IDS[number];
export type GaragePropPose = { x: number; z: number; yaw: number };
export type GarageRoomLayout = Record<GaragePropId, GaragePropPose>;
export const GARAGE_PROP_LABELS: Record<GaragePropId, string> = {
  lockers: "Lockers", desk: "Map desk", shelf: "Tire shelf", toolbox: "Tool chest", jack: "Floor jack", crane: "Engine hoist",
};
export const GARAGE_FLOOR_BOUNDS = { minX: -6.64, maxX: 8.50, minZ: -6.18, maxZ: 8.75 };
export const CRANE_SCALE = .85;
const point = (x: number, z: number, yaw = 0): GaragePropPose => ({ x, z, yaw });
export const DEFAULT_GARAGE_LAYOUT: GarageRoomLayout = {
  lockers: point(-4.97, -5.72),
  desk: point(6.75, -3.98, -Math.PI / 2),
  shelf: point(8.12, -1.95, -Math.PI / 2),
  toolbox: point(8.02, -.35, -Math.PI / 2),
  jack: point(8.07, 1.02, 0),
  crane: point(-5.55, 4.64, Math.PI / 2),
};

export function floorPlacement({ x, z, yaw }: GaragePropPose) {
  return { position: [x, 0, z] as [number, number, number], yaw };
}
export const GARAGE_PARKING = floorPlacement(point(GARAGE_BAY_DOORS[0].position[0] + .10, .80));
export type GarageParkingObstacle = GaragePropPose & { halfWidth: number; halfLength: number };
function box(x: number, z: number, width: number, depth: number, yaw = 0): GarageParkingObstacle {
  return { x, z, halfWidth: width / 2, halfLength: depth / 2, yaw };
}

// Width, depth and the local center of each rendered group. Pivot offsets turn
// with the model when the player rotates the desk, locker bank or tire shelf.
const localFootprints: Record<GaragePropId, GarageParkingObstacle> = {
  lockers: box(.70, .08, 2.55, 1.07),
  desk: box(.03, -.48, 2.05, 2.22),
  shelf: box(0, .025, 1.18, .59),
  toolbox: box(0, -.06, .90, .66),
  jack: box(0, 0, .26, .84),
  crane: box(0, 0, 1.372 * CRANE_SCALE, 2.383 * CRANE_SCALE),
};
export function garagePropFootprint(id: GaragePropId, pose: GaragePropPose): GarageParkingObstacle {
  const local = localFootprints[id], c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  return { ...local, x: pose.x + c * local.x + s * local.z, z: pose.z - s * local.x + c * local.z, yaw: pose.yaw };
}

export const GARAGE_FIXED_OBSTACLES = [
  box(-5.26, 0, 1.60, 7.60), box(3.47, -4.15, 1.45, 1.58),
  box(-6.33, -6.12, 1.54, 1.54), box(6.46, -6.12, 1.54, 1.54), box(-6.33, 6.39, 1.54, 1.54),
];
export function garageParkingObstacles(layout: GarageRoomLayout): readonly GarageParkingObstacle[] {
  return [...GARAGE_FIXED_OBSTACLES, ...GARAGE_PROP_IDS.map(id => garagePropFootprint(id, layout[id]))];
}
export const GARAGE_PARKING_OBSTACLES = garageParkingObstacles(DEFAULT_GARAGE_LAYOUT);

// Compare both pairs of local axes. This permits close-packed wall placement
// without blocking an adjacent aisle because of an oversize world-aligned box.
export function garageFootprintsOverlap(x: number, z: number, yaw: number, w: number, l: number, b: GarageParkingObstacle) {
  const dx = x - b.x, dz = z - b.z;
  const c = Math.cos(yaw), s = Math.sin(yaw), cb = Math.cos(b.yaw), sb = Math.sin(b.yaw);
  const cc = Math.abs(c * cb + s * sb), ss = Math.abs(s * cb - c * sb);
  return Math.abs(dx * c - dz * s) < w + b.halfWidth * cc + b.halfLength * ss &&
    Math.abs(dx * s + dz * c) < l + b.halfWidth * ss + b.halfLength * cc &&
    Math.abs(dx * cb - dz * sb) < b.halfWidth + w * cc + l * ss &&
    Math.abs(dx * sb + dz * cb) < b.halfLength + w * ss + l * cc;
}

const stallX = GARAGE_PARKING.position[0];
export const GARAGE_RESERVED_AREAS = [
  // The widest pickup can always leave the home stall on the left. Keep a
  // walkway from the standing actor to either side of the driver's cabin.
  box(stallX, 3.42, 2.54, 11.25), box(-1.09, .38, 2.76, 2.02),
  // Keep the door sills and personnel exits accessible.
  box(.93, 8.03, 15.14, 1.44),
];
function overlaps(a: GarageParkingObstacle, b: GarageParkingObstacle) {
  return garageFootprintsOverlap(a.x, a.z, a.yaw, a.halfWidth, a.halfLength, b);
}
export function garagePlacementError(layout: GarageRoomLayout): string | undefined {
  const placed: GarageParkingObstacle[] = [];
  for (const id of GARAGE_PROP_IDS) {
    const pose = layout[id], name = GARAGE_PROP_LABELS[id];
    if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z) || !Number.isFinite(pose.yaw) ||
        Math.abs(pose.yaw) > 2 * Math.PI) return "Choose a valid floor position.";
    const prop = garagePropFootprint(id, pose), c = Math.abs(Math.cos(prop.yaw)), s = Math.abs(Math.sin(prop.yaw));
    const dx = c * prop.halfWidth + s * prop.halfLength, dz = s * prop.halfWidth + c * prop.halfLength;
    const { minX, maxX, minZ, maxZ } = GARAGE_FLOOR_BOUNDS;
    if (prop.x - dx < minX || prop.x + dx > maxX || prop.z - dz < minZ || prop.z + dz > maxZ)
      return `Keep ${name.toLowerCase()} inside the room.`;
    if (GARAGE_FIXED_OBSTACLES.some(b => overlaps(prop, b))) return "A wall fixture occupies that space.";
    if (GARAGE_RESERVED_AREAS.some(b => overlaps(prop, b))) return "Keep the doors and departure path clear.";
    if (placed.some(b => overlaps(prop, b))) return "Leave space between furnishings.";
    placed.push(prop);
  }
}
export function validateGarageRoomLayout(value: unknown): value is GarageRoomLayout {
  if (!value || typeof value !== "object" || Object.keys(value).length !== GARAGE_PROP_IDS.length ||
      !GARAGE_PROP_IDS.every(id => Object.hasOwn(value, id))) return false;
  return !garagePlacementError(value as GarageRoomLayout);
}
