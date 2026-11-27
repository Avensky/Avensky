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
  let stationTilt: "left" | "right" | "up" | "down" | undefined;
  const strongest = (a = 0, b = 0) => axis(Math.abs(a) >= Math.abs(b) ? a : b, 0.5);
  return {
    reset() { lastVertical = lastHorizontal = -Infinity; stationTilt = undefined; },
    read(pad: Gamepad, edges: boolean[], now: number, sticks: boolean | "left" | "stations" = true) {
      if (sticks === "stations") {
        // One move per deliberate tilt. Repeating against moving camera labels can
        // otherwise send the player back to the station they just left.
        const x = axis(pad.axes[0], .35), y = axis(pad.axes[1], .35);
        let step: typeof stationTilt;
        if (!x && !y) stationTilt = undefined;
        else if (Math.max(Math.abs(x), Math.abs(y)) >= .5) {
          // A little hysteresis on the diagonal keeps a noisy stick on one axis.
          const bias = !stationTilt ? 0 : stationTilt === "left" || stationTilt === "right" ? .15 : -.15;
          const tilt = Math.abs(x) + bias > Math.abs(y) ? (x < 0 ? "left" : "right") : (y < 0 ? "up" : "down");
          if (stationTilt !== tilt) step = tilt;
          stationTilt = tilt;
        }
        if (edges[12]) return "up";
        if (edges[13]) return "down";
        if (edges[14]) return "left";
        if (edges[15]) return "right";
        return step;
      }
      const vertical = sticks ? strongest(pad.axes[1], sticks === true ? pad.axes[3] : 0) : 0;
      const horizontal = sticks ? strongest(pad.axes[0], sticks === true ? pad.axes[2] : 0) : 0;
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
