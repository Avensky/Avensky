type Control = (x: number, y: number, turn: number, elapsed: number) => void;
let controls: Control | undefined;
let lastPoll = 0;

export function bindRosterSticks(control: Control) {
  controls = control;
  return () => {
    if (controls !== control) return;
    releaseRosterSticks();
    controls = undefined;
  };
}

export function releaseRosterSticks() {
  if (lastPoll) controls?.(0, 0, 0, 0);
  lastPoll = 0;
}

/** Use the existing gamepad poll. Held sticks never start a second animation loop. */
export function readRosterSticks(x: number, y: number, turn: number, now: number) {
  if (!controls) return false;
  controls(x, y, turn, lastPoll ? Math.min(.05, Math.max(0, now - lastPoll) / 1000) : 0);
  lastPoll = now;
  return true;
}
