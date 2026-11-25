export type EntryMotion = {
  yaw: number; pitch: number; dragging: boolean; lastInput?: number; dragStarted?: number; targetYaw?: number; targetPitch?: number;
  invalidate?: () => void;
};

/** Input lives with the room, so grabbing during GLB loading cancels the entrance offset too. */
export function installGarageEntryInteraction(motion: EntryMotion, interactivePreview: () => boolean) {
  let pointer: { id: number; x: number; y: number } | null = null;
  let idleTimer = 0;
  let swallowPointer = false;
  let swallowClickUntil = 0;
  const root = document.documentElement;
  const isLogin = () => !!document.querySelector(".garage-credentials") && !interactivePreview();
  const wake = () => {
    delete root.dataset.garageUiIdle;
    window.clearTimeout(idleTimer);
    if (isLogin()) idleTimer = window.setTimeout(() => {
      if (isLogin() && !document.activeElement?.matches("input,textarea") && !document.querySelector(".text-keyboard")) {
        root.dataset.garageUiIdle = "true";
      }
    }, 18000);
  };
  const scope = new AbortController();
  const capture = { signal: scope.signal, capture: true };
  document.addEventListener("pointerdown", event => {
    if (!isLogin()) return;
    if (root.dataset.garageUiIdle === "true") {
      wake();
      swallowPointer = true;
      swallowClickUntil = performance.now() + 600;
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    wake();
    if (event.button !== 0 || (event.target as Element).closest(".garage-entry-card,.garage-entry-header,.garage-notices,.text-keyboard")) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    motion.dragging = true;
    motion.dragStarted = performance.now();
    motion.lastInput = motion.dragStarted;
    if (root.dataset.garageReady !== "true") {
      motion.yaw = 0; motion.pitch = 0;
    }
    motion.targetYaw = motion.yaw; motion.targetPitch = motion.pitch;
    root.setPointerCapture(event.pointerId);
    motion.invalidate?.();
    event.preventDefault();
  }, capture);
  document.addEventListener("pointermove", event => {
    if (isLogin()) wake();
    if (!pointer || pointer.id !== event.pointerId) return;
    motion.targetYaw = Math.max(-.12, Math.min(.12, (motion.targetYaw ?? motion.yaw) + (event.clientX - pointer.x) * .0007));
    motion.targetPitch = Math.max(-.045, Math.min(.045, (motion.targetPitch ?? motion.pitch) + (event.clientY - pointer.y) * .00045));
    motion.lastInput = performance.now();
    pointer.x = event.clientX; pointer.y = event.clientY;
    motion.invalidate?.();
  }, capture);
  const release = (event: PointerEvent) => {
    if (swallowPointer) {
      swallowPointer = false;
      swallowClickUntil = performance.now() + 600;
      event.preventDefault(); event.stopImmediatePropagation();
    }
    if (pointer?.id !== event.pointerId) return;
    pointer = null; motion.dragging = false;
    motion.targetYaw = undefined; motion.targetPitch = undefined;
    motion.lastInput = performance.now();
    if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    motion.invalidate?.();
    wake();
  };
  document.addEventListener("pointerup", release, capture);
  document.addEventListener("pointercancel", release, capture);
  document.addEventListener("click", event => {
    if (performance.now() < swallowClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, capture);
  document.addEventListener("keydown", event => {
    if (!isLogin()) return;
    if (root.dataset.garageUiIdle === "true") {
      event.preventDefault(); event.stopImmediatePropagation();
    }
    wake();
  }, capture);
  for (const event of ["focusin", "input", "wheel"]) document.addEventListener(event, wake, { signal: scope.signal });
  window.addEventListener("avensky:garage-ready", wake, { signal: scope.signal });
  window.addEventListener("avensky:portal-form", wake, { signal: scope.signal });
  window.addEventListener("avensky:garage-activity", wake, { signal: scope.signal });
  window.addEventListener("avenlab:panel-action", event => {
    if (root.dataset.garageUiIdle === "true" && isLogin()) event.stopImmediatePropagation();
    wake();
  }, { signal: scope.signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { pointer = null; motion.dragging = false;
    motion.targetYaw = undefined; motion.targetPitch = undefined; }
    else { motion.lastInput = performance.now(); wake(); motion.invalidate?.(); }
  }, { signal: scope.signal });
  return scope;
}
