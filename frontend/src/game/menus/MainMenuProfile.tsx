import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { MenuAction } from "../../controls/inputRouting";
import { createGuestProfile, signInDeviceProfile, signOutPlayerProfile } from "../../net/socialClient";
import { connectRustServer, disconnectRustServer } from "../../net/rustSocket";
import { useSocialStore } from "../../store/social/socialStore";
import { useUIStore } from "../../store/menus/uiStore";
import { CharacterHeaderButton } from "../characters/CharacterHeaderProfile";
import { useSavedPlayerCharacter } from "../characters/localOutfits";
import { PLAYER_ONBOARDING } from "../welcome/config";
import "./mainMenuProfile.css";

export function MainMenuProfile({ focusMenu }: { focusMenu?: () => void }) {
  const name = useSocialStore(state => state.view?.profile.name);
  const scope = useSocialStore(state => state.profileScope);
  const available = useSocialStore(state => state.available);
  const status = useSocialStore(state => state.profileStatus);
  const registered = useSocialStore(state => state.registeredProfile);
  const stagingSignIn = useSocialStore(state => state.stagingSignIn);
  const choice = useSavedPlayerCharacter(!registered && !stagingSignIn);
  const message = useSocialStore(state => state.message);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const panelId = useId();
  const guest = Boolean(name) && scope === "tab";
  const signedIn = Boolean(name) && !guest;
  const busy = status === "restoring" || signingOut;
  const caption = name ?? "Sign in";

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (!focusMenu && !open) return;
    function route(event: Event) {
      const action = (event as CustomEvent<MenuAction>).detail;
      const active = document.activeElement;
      if (!open) {
        if (!focusMenu) return;
        if (action === "right") trigger.current?.focus({ preventScroll: true });
        else if (active === trigger.current && action === "activate") trigger.current?.click();
        else if (active === trigger.current && (action === "left" || action === "back")) focusMenu();
        else return;
      } else if (action === "back") close();
      else if (action === "activate") {
        if (active === trigger.current) close();
        else if (active instanceof HTMLElement && active.matches("button") && panel.current?.contains(active)) active.click();
        else panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      } else if (["up", "down", "left", "right"].includes(action)) {
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const index = buttons.findIndex(button => button === active);
        const step = action === "up" || action === "left" ? -1 : 1;
        buttons[index < 0 ? 0 : (index + step + buttons.length) % buttons.length]?.focus();
      } else return;
      event.preventDefault();
      // Social normally owns this event. An expanded account chooser handles
      // its own rows and Back before the containing social screen does.
      if (!focusMenu) event.stopImmediatePropagation();
    }
    const eventName = focusMenu ? "avenlab:main-menu-action" : "avenlab:panel-action";
    window.addEventListener(eventName, route, true);
    return () => window.removeEventListener(eventName, route, true);
  }, [close, focusMenu, open]);

  async function connect(action: () => Promise<void>) {
    try {
      await action();
      if (root.current?.contains(document.activeElement)) close();
      else setOpen(false);
    } catch { /* The social client publishes the request error for this panel. */ }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      if (await signOutPlayerProfile() === "portal") return;
      useUIStore.getState().setScreen("welcome");
      disconnectRustServer();
      connectRustServer();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  return <header ref={root} className="main-menu-profile" onKeyDownCapture={event => {
    if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <CharacterHeaderButton ref={trigger} angled choice={choice} name={caption}
      data-main-profile-toggle aria-label={`Player profile · ${caption}`} aria-expanded={open} aria-controls={panelId}
      onClick={open ? close : () => setOpen(true)} />
    <section ref={panel} id={panelId} className="main-menu-profile-panel menu-panel-frame" aria-label="Player profile options" hidden={!open}>
      {(status === "restoring" || status === "error") && <p role="status">{message}</p>}
      {!available && <p role="status">Connect to the game server to sign in.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="main-menu-profile-options">
        {stagingSignIn && signedIn && status === "ready" && <button type="button" className="menu-control menu-panel-frame"
          onClick={() => useUIStore.getState().setScreen("welcome", "account")}>Account</button>}
        {PLAYER_ONBOARDING && !registered && <button type="button" className="menu-control menu-panel-frame" disabled={busy}
          onClick={() => useUIStore.getState().setScreen("welcome")}>Player options</button>}
        {PLAYER_ONBOARDING && registered && <button type="button" className="menu-control menu-panel-frame" disabled={busy}
          onClick={() => useUIStore.getState().setScreen("welcome")}>Switch character</button>}
        {PLAYER_ONBOARDING && registered && <button type="button" className="menu-control menu-panel-frame" disabled={!available || busy}
          onClick={() => void signOut()}>{signingOut ? "Logging out…" : "Log out"}</button>}
        {!PLAYER_ONBOARDING && !signedIn && <button type="button" className="menu-control menu-panel-frame" disabled={!available || busy}
          onClick={() => void connect(signInDeviceProfile)}>Sign in on this device</button>}
        {!PLAYER_ONBOARDING && !guest && <button type="button" className="menu-control menu-panel-frame" disabled={busy}
          onClick={() => available ? void connect(createGuestProfile) : close()}>Continue as guest</button>}
      </div>
    </section>
  </header>;
}
