import { createStore } from "zustand/vanilla";
import type { MenuInputDevice } from "./inputDevice";

export const activeMenuDevice = createStore<MenuInputDevice | null>(() => null);

export function reportMenuDevice(device: MenuInputDevice | null) {
  if (activeMenuDevice.getState() !== device) activeMenuDevice.setState(device, true);
}

export function listenForMenuInput() {
  const pointer = (event: PointerEvent) => reportMenuDevice(event.pointerType === "touch" || event.pointerType === "pen" ? "touch" : "keyboard");
  const key = (event: KeyboardEvent) => { if (!event.repeat) reportMenuDevice("keyboard"); };
  window.addEventListener("pointerdown", pointer, { capture: true, passive: true });
  window.addEventListener("keydown", key, true);
  return () => {
    window.removeEventListener("pointerdown", pointer, true);
    window.removeEventListener("keydown", key, true);
  };
}
