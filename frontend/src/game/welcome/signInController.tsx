import { useState } from "react";
import { GameButton } from "../../components/GameButton";
import { GarageCredentialFields } from "./GarageCredentialFields";
import { createRoot } from "react-dom/client";
import { MenuShortcuts } from "../../components/controller/MenuShortcuts";
import { MenuInputDeviceContext } from "../../components/controller/useMenuInputDevice";
import { OnScreenKeyboard } from "../../components/text/OnScreenKeyboard";
import { openFieldKeyboard } from "../../components/text/openFieldKeyboard";
import type { MenuAction } from "../../controls/inputRouting";
import { createMenuDirections, menuNeutral } from "../../controls/menuDirections";
import { useTextKeyboardStore } from "../../store/text/keyboardStore";
import { navigateFormRows } from "../social/formRows";

function moveNotices(card: HTMLElement) {
  const body = card.closest(".garage-entry-body");
  if (!body) return;
  let notices = body.querySelector<HTMLElement>(".garage-notices");
  for (const message of card.querySelectorAll<HTMLElement>('[role="alert"],[role="status"]')) {
    if (!notices) {
      notices = document.createElement("aside");
      notices.className = "garage-notices";
      notices.setAttribute("aria-label", "Announcements and issues");
      body.prepend(notices);
    }
    notices.append(message);
  }
}

function attachController(form: HTMLElement) {
  moveNotices(form);
  const islands: ReturnType<typeof createRoot>[] = [];
  const credentials = form.querySelector<HTMLFormElement>(".garage-credentials");
  const login = credentials?.querySelector<HTMLInputElement>('input[name="email"]')?.value ?? "";
  const password = credentials?.querySelector<HTMLInputElement>('input[name="password"]')?.value ?? "";
  for (const native of form.querySelectorAll<HTMLElement>("button,a[href],[data-portal-href],[data-portal-submit],[data-portal-control]")) {
    if (credentials?.contains(native)) continue;
    const nativeForm = native instanceof HTMLButtonElement ? native.form : native.closest("form");
    const control = native.getAttribute("aria-controls") ?? native.dataset.portalControl;
    const href = native instanceof HTMLAnchorElement ? native.href : native.dataset.portalHref;
    const submit = native instanceof HTMLButtonElement ? native.type === "submit" : native.dataset.portalSubmit === "true";
    const mount = document.createElement("div");
    mount.style.display = "contents";
    native.replaceWith(mount);
    function Action() {
      const [label, setLabel] = useState(native.textContent);
      return <GameButton variant="menu" className={native.className}
        data-portal-href={href} data-portal-submit={submit ? "true" : undefined} data-portal-control={control}
        aria-controls={control}
        aria-label={native.getAttribute("aria-label") ?? undefined}
        disabled={native instanceof HTMLButtonElement && native.disabled}
        onPress={() => {
          if (control) {
            const field = document.getElementById(control);
            if (field instanceof HTMLInputElement) {
              field.type = field.type === "password" ? "text" : "password";
              setLabel(field.type === "password" ? "Show password" : "Hide password");
            }
          } else if (href) {
            window.dispatchEvent(new CustomEvent("avensky:portal-navigate", { detail: href }));
          } else if (submit) nativeForm?.requestSubmit();
          else { native.click(); setLabel(native.textContent); }
        }}>{label}</GameButton>;
    }
    const island = createRoot(mount);
    island.render(<Action />);
    islands.push(island);
    if (!mount.closest("[data-controller-row]")) mount.setAttribute("data-controller-row", "");
  }
  if (credentials) {
    const island = createRoot(credentials);
    island.render(<GarageCredentialFields portal login={login} password={password}
      onReady={() => { form.dataset.controlsReady = "true"; }} />);
    islands.push(island);
  } else form.dataset.controlsReady = "true";

  {
    // Verification and recovery fields join the same directional row navigation.
    for (const field of form.querySelectorAll('input:not([type=hidden]),button,a[href],[role="button"]')) {
      if (field.closest("[data-controller-row]")) continue;
      const row = field.closest(".password-control") ?? field.closest("label,nav") ?? field;
      row.setAttribute("data-controller-row", "");
    }
  }
  const controls = document.createElement("div");
  controls.className = "garage-gamepad-controls";
  form.append(controls);
  const root = createRoot(controls);
  root.render(<MenuInputDeviceContext.Provider value="controller">
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
    const wasIdle = document.documentElement.dataset.garageUiIdle === "true";
    window.dispatchEvent(new Event("avensky:garage-activity"));
    if (wasIdle) return;
    form.dataset.gamepad = "";
    if (useTextKeyboardStore.getState().session) {
      window.dispatchEvent(new CustomEvent("avenlab:keyboard-action", { detail: action }));
      return;
    }
    let active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (action === "activate") {
      if (!active || !form.contains(active)) {
        active = form.querySelector<HTMLElement>(".garage-field[data-selected=true] input");
        if (!active) {
          navigateFormRows(form, active, "down", remembered);
          active = document.activeElement as HTMLElement | null;
        }
      }
      if (active instanceof HTMLInputElement) openFieldKeyboard(active);
      else if (active?.matches('button:enabled, a[href], [role="button"]:not([aria-disabled="true"])')) active.click();
    } else if (action === "back") {
      form.querySelector<HTMLElement>(".portal-back")?.click();
    } else if (action === "up" || action === "down" || action === "left" || action === "right") {
      navigateFormRows(form, active && form.contains(active) ? active :
        form.querySelector<HTMLElement>(".garage-field[data-selected=true] input"), action, remembered);
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
  const scope = new AbortController();
  const options = { signal: scope.signal };
  window.addEventListener("keydown", event => {
    if (event.key === "Tab") { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (useTextKeyboardStore.getState().session) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault(); event.stopImmediatePropagation();
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      navigateFormRows(form, active && form.contains(active) ? active :
        form.querySelector<HTMLElement>(".garage-field[data-selected=true] input"),
        event.key === "ArrowUp" ? "up" : "down", remembered);
    } else if (event.key === "Enter" && !(document.activeElement?.matches('[role="button"]'))) {
      event.preventDefault();
      const field = document.activeElement instanceof HTMLInputElement ? document.activeElement :
        form.querySelector<HTMLInputElement>(".garage-field[data-selected=true] input");
      if (field === document.activeElement) navigateFormRows(form, field, "down", remembered);
      else field?.focus({ preventScroll: true });
    }
  }, { ...options, capture: true });
  document.addEventListener("pointerdown", () => { delete form.dataset.gamepad; }, { ...options, capture: true });
  for (const event of ["gamepadconnected", "focus", "pageshow"]) window.addEventListener(event, start, options);
  for (const event of ["blur", "pagehide"]) window.addEventListener(event, stop, options);
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start(), options);
  window.addEventListener("avensky:leave-portal-form", () => {
    scope.abort(); stop();
    if (useTextKeyboardStore.getState().session) useTextKeyboardStore.getState().close();
    root.unmount(); islands.forEach(island => island.unmount()); controls.remove();
  }, { ...options, once: true });
  start();
}

function attach() {
  const card = document.querySelector<HTMLElement>(".garage-entry-card[data-controller-rows]");
  if (card && !card.querySelector(".garage-gamepad-controls")) attachController(card);
}
window.addEventListener("avensky:portal-form", attach);
window.addEventListener("avensky:portal-notice", () => {
  const card = document.querySelector<HTMLElement>(".garage-entry-card");
  if (card) moveNotices(card);
});
attach();
