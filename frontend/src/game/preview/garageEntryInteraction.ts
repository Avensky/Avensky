export type EntryMotion = {
  yaw: number; pitch: number; dragging: boolean; lastInput?: number; dragStarted?: number; targetYaw?: number; targetPitch?: number;
  stickYaw?: number; stickPitch?: number;
  invalidate?: () => void;
};

export type ActorInput = { hit: (clientX: number, clientY: number) => boolean; turn: (radians: number) => void };
const IDLE_MS = 18000;
export const MAX_YAW = .24;
export const MAX_PITCH = .09;

/** Input lives with the room, so grabbing during GLB loading cancels the entrance offset too. */
export function installGarageEntryInteraction(motion: EntryMotion, interactivePreview: () => boolean, getActor?: () => ActorInput | undefined) {
  let pointer: { id: number; x: number; y: number; actor?: ActorInput } | null = null;
  let idleTimer = 0;
  let lastActivity = 0;
  let wakePointer: number | undefined;
  let swallowClickUntil = 0;
  const root = document.documentElement;
  const isLogin = () => !!document.querySelector("form.garage-credentials") && !interactivePreview();
  const checkIdle = () => {
    idleTimer = 0;
    if (!isLogin()) return;
    const remaining = lastActivity + IDLE_MS - performance.now();
    if (remaining > 0) idleTimer = window.setTimeout(checkIdle, remaining);
    else if (!pointer && !document.activeElement?.matches("input,textarea") && !document.querySelector(".text-keyboard")) {
      root.dataset.garageUiIdle = "true";
    }
  };
  const wake = () => {
    lastActivity = performance.now();
    if (root.dataset.garageUiIdle) delete root.dataset.garageUiIdle;
    if (!idleTimer && isLogin()) idleTimer = window.setTimeout(checkIdle, IDLE_MS);
  };
  const scope = new window.AbortController();
  const capture = { signal: scope.signal, capture: true };
  document.addEventListener("pointerdown", event => {
    const login = isLogin();
    if (login && root.dataset.garageUiIdle === "true") {
      wake();
      wakePointer = event.pointerId;
      swallowClickUntil = performance.now() + 600;
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    if (login) wake();
    if (event.button !== 0 || !event.isPrimary || pointer || interactivePreview()) return;
    const target = event.target as Element;
    if (login ? target.closest(".garage-entry-card,.garage-entry-header,.garage-notices,.text-keyboard-overlay")
        : !target.closest(".garage-orbit-surface")) return;
    const actor = getActor?.();
    const hit = actor?.hit(event.clientX, event.clientY) ? actor : undefined;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, actor: hit };
    root.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (hit) return;
    motion.dragging = true;
    motion.dragStarted = performance.now();
    motion.lastInput = motion.dragStarted;
    if (root.dataset.garageReady !== "true") {
      motion.yaw = 0; motion.pitch = 0;
    }
    motion.targetYaw = motion.yaw; motion.targetPitch = motion.pitch;
    motion.invalidate?.();
  }, capture);
  document.addEventListener("pointermove", event => {
    if (root.dataset.garageUiIdle === "true") wake();
    else if (idleTimer) lastActivity = performance.now();
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.actor) {
      if (pointer.actor === getActor?.()) pointer.actor.turn((event.clientX - pointer.x) * .008);
      pointer.x = event.clientX;
      return;
    }
    const yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, (motion.targetYaw ?? motion.yaw) + (event.clientX - pointer.x) * .0014));
    const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, (motion.targetPitch ?? motion.pitch) + (event.clientY - pointer.y) * .0009));
    pointer.x = event.clientX; pointer.y = event.clientY;
    if (yaw === motion.targetYaw && pitch === motion.targetPitch) return;
    motion.targetYaw = yaw; motion.targetPitch = pitch;
    motion.invalidate?.();
  }, capture);
  const release = (event: PointerEvent) => {
    if (wakePointer !== undefined && wakePointer === event.pointerId) {
      wakePointer = undefined;
      swallowClickUntil = performance.now() + 600;
      event.preventDefault(); event.stopImmediatePropagation();
    }
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer = null; motion.dragging = false;
    motion.targetYaw = undefined; motion.targetPitch = undefined;
    motion.lastInput = performance.now();
    if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    motion.invalidate?.();
    wake();
  };
  document.addEventListener("pointerup", release, capture);
  document.addEventListener("pointercancel", release, capture);
  root.addEventListener("lostpointercapture", event => {
    if (event.target === root && pointer?.id === event.pointerId) release(event);
  }, capture);
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
    if (document.hidden) {
      pointer = null; motion.dragging = false; wakePointer = undefined;
      motion.targetYaw = undefined; motion.targetPitch = undefined;
    } else {
      motion.lastInput = performance.now();
      wake();
      if (motion.yaw || motion.pitch) motion.invalidate?.();
    }
  }, { signal: scope.signal });
  scope.signal.addEventListener("abort", () => window.clearTimeout(idleTimer), { once: true });
  return scope;
}
