export const GARAGE_ORBIT_IDLE_MS = 12_000;

/** An inspected angle can stay on screen without requesting a single animation frame. */
export function createGarageOrbitIdle(returnToFrame: () => void) {
  let scope: AbortController | undefined;
  let timer: number | undefined;
  let deadline = 0;
  const pointers = new Set<number>();

  function stopTimer() {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  }
  function cancel() {
    stopTimer();
    scope?.abort();
    scope = undefined;
    pointers.clear();
  }
  function check() {
    timer = undefined;
    const remaining = deadline - performance.now();
    if (remaining > 0) timer = window.setTimeout(check, remaining);
    else {
      cancel();
      returnToFrame();
    }
  }
  function activity() {
    if (!scope) return;
    deadline = performance.now() + GARAGE_ORBIT_IDLE_MS;
    if (!document.hidden && !pointers.size && timer === undefined)
      timer = window.setTimeout(check, GARAGE_ORBIT_IDLE_MS);
  }
  function arm() {
    if (!scope) {
      scope = new window.AbortController();
      const capture = { signal: scope.signal, capture: true, passive: true };
      document.addEventListener("pointerdown", event => {
        pointers.add(event.pointerId);
        stopTimer();
      }, capture);
      const release = (event: PointerEvent) => {
        pointers.delete(event.pointerId);
        activity();
      };
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"] as const)
        document.addEventListener(event, release, capture);
      for (const event of ["pointermove", "keydown", "input", "wheel"] as const)
        document.addEventListener(event, activity, capture);
      for (const event of ["avenlab:panel-action", "avenlab:main-menu-action", "avenlab:panel-press", "avenlab:keyboard-action", "avensky:garage-activity"])
        window.addEventListener(event, activity, capture);
      window.addEventListener("blur", () => { pointers.clear(); activity(); }, capture);
      document.addEventListener("visibilitychange", () => {
        pointers.clear();
        if (document.hidden) stopTimer();
        else activity();
      }, capture);
    }
    activity();
  }
  return { arm, cancel, activity };
}
