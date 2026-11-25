import { controllerAxis as axis } from "./controllerAxes";

export function menuNeutral(pad: Gamepad) {
  return (
    pad.axes.slice(0, 4).every((value) => axis(value, 0.5) === 0) &&
    [0, 1, 2, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15].every(
      (index) => !pad.buttons[index]?.pressed,
    )
  );
}

/** The standalone sign-in and the game use the same D-pad edges and stick repeat. */
export function createMenuDirections() {
  let lastVertical = -Infinity;
  let lastHorizontal = -Infinity;
  const strongest = (a = 0, b = 0) => axis(Math.abs(a) >= Math.abs(b) ? a : b, 0.5);
  return {
    reset() { lastVertical = lastHorizontal = -Infinity; },
    read(pad: Gamepad, edges: boolean[], now: number) {
      const vertical = strongest(pad.axes[1], pad.axes[3]);
      const horizontal = strongest(pad.axes[0], pad.axes[2]);
      if (edges[12] || edges[13] || (vertical && now - lastVertical >= 220)) {
        lastVertical = now;
        return edges[12] || (!edges[13] && vertical < 0) ? "up" : "down";
      }
      if (edges[14] || edges[15] || (horizontal && now - lastHorizontal >= 220)) {
        lastHorizontal = now;
        return edges[14] || (!edges[15] && horizontal < 0) ? "left" : "right";
      }
      return undefined;
    },
  };
}
