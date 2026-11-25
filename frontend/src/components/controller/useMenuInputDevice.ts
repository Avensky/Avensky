import { createContext, useContext } from "react";
import type { MenuInputDevice } from "../../controls/inputDevice";
import { resolveMenuInputDevice } from "../../controls/inputDevice";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";

export const MenuInputDeviceContext = createContext<MenuInputDevice | undefined>(undefined);

export function useMenuInputDevice() {
  const override = useContext(MenuInputDeviceContext);
  return usePreferencesStore((state) => override ?? resolveMenuInputDevice(state.inputDevice));
}
