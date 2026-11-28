import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

const PRESS_TARGET = 'button, [role="button"], [role="tab"]';

/** A release belongs to the control that received its press, even across menus. */
export function useMenuPressOwner() {
  const pointerOwner = useRef<Element | null>(null);
  const keyboardOwner = useRef<EventTarget | null>(null);

  return {
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      pointerOwner.current = event.button === 0
        ? (event.target as Element).closest(PRESS_TARGET)
        : null;
    },
    onPointerCancelCapture() {
      pointerOwner.current = null;
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      const native = event.nativeEvent;
      // Controller/assistive clicks have no pointer. Some touch clicks have zero detail.
      if (event.detail === 0 && !("pointerType" in native && native.pointerType)) return;
      const owner = pointerOwner.current;
      pointerOwner.current = null;
      if (owner !== (event.target as Element).closest(PRESS_TARGET)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onKeyDownCapture(event: KeyboardEvent<HTMLElement>) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.repeat) {
        event.preventDefault();
        event.stopPropagation();
      } else keyboardOwner.current = event.target;
    },
    onKeyUpCapture(event: KeyboardEvent<HTMLElement>) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (keyboardOwner.current !== event.target) {
        event.preventDefault();
        event.stopPropagation();
      }
      keyboardOwner.current = null;
    },
  };
}
