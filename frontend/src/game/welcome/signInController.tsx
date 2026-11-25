import { createRoot } from "react-dom/client";
import { MenuShortcuts } from "../../components/controller/MenuShortcuts";
import { MenuInputDeviceContext } from "../../components/controller/useMenuInputDevice";
import { OnScreenKeyboard } from "../../components/text/OnScreenKeyboard";
import { openFieldKeyboard } from "../../components/text/openFieldKeyboard";
import type { MenuAction } from "../../controls/inputRouting";
import { createMenuDirections, menuNeutral } from "../../controls/menuDirections";
import { useTextKeyboardStore } from "../../store/text/keyboardStore";
import { navigateFormRows } from "../social/formRows";

function attachController(form: HTMLElement) {
  if (!form.querySelector("[data-controller-row]")) {
    // The native verification and recovery forms also work before this module loads.
    for (const field of form.querySelectorAll("input:not([type=hidden]),button,a[href]")) {
      const row = field.closest(".password-control") ?? field.closest("label,nav") ?? field;
      row.setAttribute("data-controller-row", "");
    }
  }
  const controls = document.createElement("div");
  controls.className = "garage-gamepad-controls";
  form.append(controls);
  createRoot(controls).render(<MenuInputDeviceContext.Provider value="controller">
    <MenuShortcuts back={false} tabs={false} directions="both" selectLabel="Select" />
    <OnScreenKeyboard />
  </MenuInputDeviceContext.Provider>);

  const directions = createMenuDirections();
  const remembered = new WeakMap<HTMLElement, number>();
  let lastButtons: boolean[] = [];
  let activePad = -1;
  let armed = false;
  let frame = 0;

  function act(action: MenuAction) {
    form.dataset.gamepad = "";
    if (useTextKeyboardStore.getState().session) {
      window.dispatchEvent(new CustomEvent("avenlab:keyboard-action", { detail: action }));
      return;
    }
    let active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (action === "activate") {
      if (!active || !form.contains(active)) {
        navigateFormRows(form, active, "down", remembered);
        active = document.activeElement as HTMLElement | null;
      }
      if (active instanceof HTMLInputElement) openFieldKeyboard(active);
      else if (active?.matches("button:enabled, a[href]")) active.click();
    } else if (action === "back") {
      form.querySelector<HTMLAnchorElement>("a.portal-back")?.click();
    } else if (action === "up" || action === "down" || action === "left" || action === "right") {
      navigateFormRows(form, active, action, remembered);
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function poll(now: number) {
    frame = 0;
    if (document.hidden || !document.hasFocus()) return;
    const pads = Array.from(navigator.getGamepads());
    const pad = pads[activePad] ?? pads.find(p => p?.mapping === "standard");
    if (!pad) { stop(); return; }
    frame = requestAnimationFrame(poll);
    const buttons = pad.buttons.map(b => b.pressed);
    const edges = buttons.map((down, i) => down && !lastButtons[i]);
    lastButtons = buttons;
    if (pad.index !== activePad) {
      activePad = pad.index;
      directions.reset();
      armed = false;
    }
    if (!armed) { armed = menuNeutral(pad); return; }
    const direction = directions.read(pad, edges, now);
    if (direction) act(direction);
    else if (edges[4] || edges[5]) act(edges[4] ? "previous_tab" : "next_tab");
    else if (edges[0] || edges[1]) act(edges[0] ? "activate" : "back");
  }

  function start() {
    if (!frame && !document.hidden && document.hasFocus()) frame = requestAnimationFrame(poll);
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    armed = false;
    activePad = -1;
    lastButtons = [];
    delete form.dataset.gamepad;
  }
  document.addEventListener("pointerdown", () => { delete form.dataset.gamepad; }, true);
  window.addEventListener("gamepadconnected", start);
  window.addEventListener("focus", start);
  window.addEventListener("pageshow", start);
  window.addEventListener("blur", stop);
  window.addEventListener("pagehide", stop);
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
  start();
}

const card = document.querySelector<HTMLElement>(".garage-entry-card[data-controller-rows]");
if (card) attachController(card);
