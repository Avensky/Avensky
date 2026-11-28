// The existing controller poll hands the hidden preview one physical gesture.
// A held button that hid the controls must be released before it can wake them.
let consume: ((pad: Gamepad) => boolean) | undefined;

export function bindPreviewWakeInput(hidden: () => boolean, wake: () => void) {
  let previouslyActive = false;
  let waitingForRelease = false;
  const read = (pad: Gamepad) => {
    const active = pad.buttons.some(button => button.pressed) ||
      pad.axes.some(value => Math.abs(value) >= (previouslyActive ? .25 : .5));
    const freshPress = active && !previouslyActive;
    previouslyActive = active;
    if (waitingForRelease) {
      waitingForRelease = active;
      return true;
    }
    if (!hidden()) return false;
    if (freshPress) {
      waitingForRelease = true;
      wake();
    }
    return true;
  };
  consume = read;
  return () => { if (consume === read) consume = undefined; };
}

export function consumePreviewWakeInput(pad: Gamepad) {
  return consume?.(pad) ?? false;
}
