// Garage Special's author coordinates. Both renderers use the same perimeter and finish.
export const wallCorners = [[-108, -98], [108, -98], [108, 103], [-108, 103]] as const;
export const wallFloor = .85;
export const wallHeight = 100.15;
export const wallCourses = [
  { surface: "garage-panel", bottom: 0, top: .30, roughness: .52 },
  { surface: "garage-stripe", bottom: .30, top: .322, roughness: .46 },
  { surface: "garage-wall", bottom: .322, top: .812, roughness: .86 },
] as const;

export function wallPanels() {
  return wallCourses.flatMap((course, group) => wallCorners.map(([x, z], i) => {
    const [endX, endZ] = wallCorners[(i + 1) % wallCorners.length];
    return {
      ...course, group, x, z, endX, endZ, span: Math.hypot(endX - x, endZ - z) / 32,
      bottomY: wallFloor + wallHeight * course.bottom, topY: wallFloor + wallHeight * course.top
    };
  }));
}
