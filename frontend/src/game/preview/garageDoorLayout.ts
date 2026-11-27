// World metres after placing garage_special.glb on its floor anchor. The 0999 wall
// is at Z=-6.18; the opposite slab edge is at Z=8.94. Local +Z faces into the room.
const wallZ = 8.75;
function doorway(x: number) {
  return { position: [x, 0, wallZ] as const, yaw: Math.PI };
}

export const GARAGE_BAY_DOORS = [-3.20, .575, 4.35].map(x => ({
  ...doorway(x), width: 3.15, height: 3.10,
}));
export const GARAGE_PERSONNEL_DOORS = [-5.98, 7.13].map(doorway);
export const GARAGE_ENTRY_BAY = GARAGE_BAY_DOORS[1];

const openings = [
  ...GARAGE_BAY_DOORS.map(({ position, width, height }) => ({ x: position[0], width, height })),
  ...GARAGE_PERSONNEL_DOORS.map(({ position }) => ({ x: position[0], width: 1.04, height: 2.10 })),
].sort((a, b) => a.x - b.x);

const wallLeft = -6.64, wallRight = 8.50, roofHeight = 4.98;
// Include the lamp, panic hardware, and backs of the framed shutters in the culling bounds.
export const garageDoorWallBounds = { min: [wallLeft, -.02, wallZ - .23], max: [wallRight, roofHeight + .02, wallZ + .21] } as const;
type WallPanel = { center: [number, number, number]; size: [number, number, number] };
export const garageDoorWallPanels: WallPanel[] = [];
function closeWall(left: number, right: number, base: number) {
  garageDoorWallPanels.push({
    center: [(left + right) / 2, (base + roofHeight) / 2, wallZ + .075],
    size: [right - left, roofHeight - base, .16],
  });
}
let edge = wallLeft;
for (const { x, width, height } of openings) {
  const left = x - width / 2, right = x + width / 2;
  closeWall(edge, left, 0);
  closeWall(left, right, height);
  edge = right;
}
closeWall(edge, wallRight, 0);
