import type { MenuAction } from "../../controls/inputRouting";

type Direction = Extract<MenuAction, "left" | "right" | "up" | "down">;

// CSS determines how many tiles fit, including after rotating a phone. Read the
// actual rows only when a player moves selection, never in the gamepad poll.
export function nextCreatorControl(controls: HTMLElement[], current: HTMLElement, action: Direction) {
  const index = controls.indexOf(current);
  if (index < 0) return controls[0];
  const direction = action === "left" || action === "up" ? -1 : 1;
  const adjacent = controls[(index + direction + controls.length) % controls.length];
  if (action === "left" || action === "right") return adjacent;

  const rect = current.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  let nearest: HTMLElement | undefined;
  let rowDistance = Infinity;
  let columnDistance = Infinity;
  for (const control of controls) {
    if (control === current) continue;
    const candidate = control.getBoundingClientRect();
    const gap = direction > 0 ? candidate.top - rect.bottom : rect.top - candidate.bottom;
    if (gap < -1) continue;
    // A wide field spans every column. Within a row, choose the closest center.
    const column = Math.abs(candidate.left + candidate.width / 2 - x);
    if (gap < rowDistance - 1 || (Math.abs(gap - rowDistance) <= 1 && column < columnDistance)) {
      rowDistance = gap;
      columnDistance = column;
      nearest = control;
    }
  }
  return rect.height > 0 && nearest ? nearest : adjacent;
}
