import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { activeMenuDevice } from "../../controls/activeMenuDevice";
import type { MenuInputDevice } from "../../controls/inputDevice";
import { resolveMenuInputDevice } from "../../controls/inputDevice";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";

export const MenuInputDeviceContext = createContext<MenuInputDevice | undefined>(undefined);

export function useMenuInputDevice() {
  const override = useContext(MenuInputDeviceContext);
  const preference = usePreferencesStore(state => state.inputDevice);
  const activity = useStore(activeMenuDevice, device => preference === "browser" ? device : null);
  return override ?? activity ?? resolveMenuInputDevice(preference);
}
