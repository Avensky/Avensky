import type { MenuAction } from "../../controls/inputRouting";

type StationDirection = Extract<MenuAction, "up" | "down" | "left" | "right">;
type StationPosition = { control: HTMLElement; x: number; y: number; width: number; height: number };

/** Group labels that share a row (or column), then read along that line. */
function readingOrder(positions: StationPosition[], along: "x" | "y") {
  const across = along === "x" ? "y" : "x";
  const thickness = along === "x" ? "height" : "width";
  const lines: StationPosition[][] = [];
  for (const point of [...positions].sort((a, b) => a[across] - b[across])) {
    const line = lines.at(-1);
    const first = line?.[0];
    if (line && first && point[across] - first[across] <= Math.min(first[thickness], point[thickness]) / 2) {
      line.push(point);
    } else {
      lines.push([point]);
    }
  }
  return lines.flatMap(line => line.sort((a, b) => a[along] - b[along]).map(point => point.control));
}

/** Keep the station order while a selection moves the camera and its projected labels. */
export function createGarageStationNavigation() {
  let order: { horizontal: HTMLElement[]; vertical: HTMLElement[] } = { horizontal: [], vertical: [] };
  let lastFocused: HTMLElement | undefined;
  return {
    reset() { lastFocused = undefined; },
    next(controls: HTMLElement[], active: HTMLElement, direction: StationDirection) {
      if (!controls.includes(active)) return controls[0];
      const previous = order.horizontal;
      if (lastFocused !== active || controls.length !== previous.length ||
          controls.some(control => !previous.includes(control))) {
        const positions = controls.map((control, index) => {
          const { left, top, width, height } = control.getBoundingClientRect();
          // Match the narrow two-column layout before any buttons are measurable.
          return width && height
            ? { control, x: left + width / 2, y: top + height / 2, width, height }
            : { control, x: index % 2, y: Math.floor(index / 2), width: 1, height: 1 };
        });
        order = { horizontal: readingOrder(positions, "x"), vertical: readingOrder(positions, "y") };
      }
      const cycle = direction === "left" || direction === "right" ? order.horizontal : order.vertical;
      const delta = direction === "left" || direction === "up" ? -1 : 1;
      lastFocused = cycle[(cycle.indexOf(active) + delta + cycle.length) % cycle.length];
      return lastFocused;
    },
  };
}
