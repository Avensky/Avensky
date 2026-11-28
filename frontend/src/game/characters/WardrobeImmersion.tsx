import { useLayoutEffect, useRef, type RefObject } from "react";
import { bindPreviewWakeInput } from "../../controls/previewWakeInput";
import { useGarageDrive } from "../preview/garageDriveStore";

const hidden = () => useGarageDrive.getState().panelsHidden;
const wake = () => useGarageDrive.setState({ panelsHidden: false });

/** Keep the mounted editor and actor while a single tap, key, or pad gesture restores the controls. */
export function WardrobeImmersion({ root, hiddenUI }: { root: RefObject<HTMLElement | null>; hiddenUI: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const rememberFocus = useGarageDrive.subscribe((state, previous) => {
      if (!state.panelsHidden || previous.panelsHidden) return;
      const active = document.activeElement;
      returnFocus.current = active instanceof HTMLElement && root.current?.contains(active)
        ? active : root.current?.querySelector<HTMLElement>(".garage-hide-toggle") ?? null;
    });
    const releasePad = bindPreviewWakeInput(hidden, wake);
    let wakeKey: string | undefined;
    const releaseKey = () => { wakeKey = undefined; };
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const key = event.code || event.key;
      if (key !== wakeKey && !hidden()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keyup") {
        if (key === wakeKey) wakeKey = undefined;
      } else if (!event.repeat && hidden()) {
        wakeKey = key;
        wake();
      }
    };
    const panelAction = (event: Event) => {
      if (!hidden()) return;
      event.stopImmediatePropagation();
      wake();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", releaseKey);
    window.addEventListener("avenlab:panel-action", panelAction, true);
    return () => {
      releasePad();
      rememberFocus();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", releaseKey);
      window.removeEventListener("avenlab:panel-action", panelAction, true);
      if (hidden()) wake();
    };
  }, [root]);

  useLayoutEffect(() => {
    if (hiddenUI) {
      document.documentElement.setAttribute("data-wardrobe-immersive", "");
      surface.current?.focus({ preventScroll: true });
      return () => document.documentElement.removeAttribute("data-wardrobe-immersive");
    }
    const target = returnFocus.current;
    if (target) (target.isConnected ? target : root.current)?.focus({ preventScroll: true });
    returnFocus.current = null;
  }, [hiddenUI, root]);

  // Restore on click so the entire tap, including pointerup, belongs to this surface.
  return hiddenUI ? <div ref={surface} className="wardrobe-wake-surface" role="button" tabIndex={0}
    aria-label="Show wardrobe interface" onClick={event => { event.stopPropagation(); wake(); }} /> : null;
}
