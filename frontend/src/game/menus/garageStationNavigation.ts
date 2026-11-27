import type { MenuAction } from "../../controls/inputRouting";

export type StationDirection = Extract<MenuAction, "up" | "down" | "left" | "right">;

/** Read the current hit targets on a directional press. Projected labels can swap
 * sides between shots; touch portrait uses the same search on its fixed grid. */
export function nextGarageStation(controls: HTMLElement[], active: HTMLElement, direction: StationDirection) {
  const current = controls.indexOf(active);
  if (current < 0) return controls[0];
  const centers = controls.map((button, index) => {
    const rect = button.getBoundingClientRect();
    // The garage still has a two-column layout before the first measurable frame.
    return rect.width && rect.height
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: index % 2, y: Math.floor(index / 2) };
  });
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  let next = current, best = Infinity;
  for (const [index, point] of centers.entries()) {
    const dx = point.x - centers[current].x, dy = point.y - centers[current].y;
    const forward = sign * (horizontal ? dx : dy);
    const across = Math.abs(horizontal ? dy : dx);
    // A tiny vertical offset on two side-by-side buttons should never consume Down.
    if (forward <= across * .45) continue;
    const score = Math.hypot(forward, across) + across * 1.5;
    if (score < best) {
      best = score;
      next = index;
    }
  }
  return controls[next];
}
