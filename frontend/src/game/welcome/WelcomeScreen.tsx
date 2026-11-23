import { useEffect, useRef, useState, type FormEvent } from "react";
import { isTypingTarget, type MenuAction } from "../../controls/inputRouting";
import { requestSocial, selectAccount, selectGuestProfile } from "../../net/socialClient";
import { useUIStore } from "../../store/menus/uiStore";
import { useSocialStore, type PlayerProfile } from "../../store/social/socialStore";
import { characterLook } from "../characters/characterCatalog";
import { attitudeName, CHARACTER_STYLES, styleLook, styleName, type CharacterBody } from "../characters/characterStyles";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import { navigateFormRows } from "../social/formRows";
import { MenuFlareBackground } from "../../components/menus/MenuFlareBackground";
import "./welcomeScreen.css";

type Entry = "login" | "register" | "guest";

export function WelcomeScreen() {
  const connected = useSocialStore(state => state.available);
  const accounts = useSocialStore(state => state.accountsAvailable);
  const restoring = useSocialStore(state => state.profileStatus === "restoring");
  const restoreError = useSocialStore(state => state.profileStatus === "error" ? state.message : "");
  const profile = useSocialStore(state => state.view?.profile);
  const registered = useSocialStore(state => state.registeredProfile);
  const [entry, setEntry] = useState<Entry>();
  const [confirmedProfile, setConfirmedProfile] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [body, setBody] = useState<CharacterBody>("female");
  const [style, setStyle] = useState<string>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  const root = useRef<HTMLElement>(null);
  const remembered = useRef(new WeakMap<HTMLElement, number>());
  const choosingCharacter = confirmedProfile !== undefined;
  const player = choosingCharacter && profile?.id === confirmedProfile ? profile : undefined;
  const slots = player?.characters;
  const saved = player?.progression?.character;
  const showCreate = slots !== undefined && (creating || !slots.length);
  const active = selected ?? player?.active_character_id;
  const original = showCreate && !slots.length && characterLook(saved) ? saved : undefined;
  const selectedStyle = style ?? (original ? "original" : undefined);
  const busy = working || restoring;

  function back() {
    if (pending.current || restoring) return;
    if (creating && slots?.length) {
      setCreating(false);
      setStyle(undefined);
      setError("");
      return;
    }
    setConfirmedProfile(undefined);
    setEntry(undefined);
    setCreating(false);
    setSelected(undefined);
    setBody("female");
    setStyle(undefined);
    setError("");
  }

  useEffect(() => {
    root.current?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)")?.focus({ preventScroll:true });
  }, [entry, choosingCharacter, showCreate, connected]);

  useEffect(() => {
    function navigate(event: Event) {
      if (!root.current || busy) return;
      const action = (event as CustomEvent<MenuAction>).detail;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      if (action === "back") back();
      else if (action === "activate" && root.current.contains(active)) {
        if (active instanceof HTMLButtonElement) active.click();
        else if (isTypingTarget(active)) active.focus();
      } else if (["up","down","left","right"].includes(action)) {
        navigateFormRows(root.current, active, action, remembered.current);
      }
    }
    window.addEventListener("avenlab:panel-action", navigate);
    return () => window.removeEventListener("avenlab:panel-action", navigate);
  });

  async function run(task: () => Promise<void>) {
    if (pending.current || restoring) return;
    pending.current = true;
    setWorking(true);
    setError("");
    try { await task(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not continue."); }
    finally { pending.current = false; setWorking(false); }
  }

  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entry || !connected || !accounts) return;
    const form = new FormData(event.currentTarget);
    const login = String(form.get("login") ?? "");
    const name = entry === "register" ? login.trim() : String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (entry !== "login" && !name) { setError("Enter a display name."); return; }
    void run(async () => {
      const id = entry === "guest"
        ? await selectGuestProfile(name)
        : await selectAccount({ login, password }, entry === "register" ? name : undefined);
      setConfirmedProfile(id);
      setEntry(undefined);
    });
  }

  function enter(action: "character_create" | "character_select", fields: Record<string, string>) {
    if (!player || !connected || !accounts) return;
    const owner = player.id;
    void run(async () => {
      if (useSocialStore.getState().view?.profile.id !== owner) throw new Error("Your profile is reconnecting. Try again.");
      const confirmed = await requestSocial(action, fields);
      const profile = confirmed.profile as PlayerProfile | undefined;
      if (profile?.id !== owner || !profile.active_character_id ||
          !Array.isArray(profile.characters) || !profile.characters.some(slot => slot.id === profile.active_character_id) ||
          !characterLook(profile.progression?.character)) throw new Error("The server did not confirm your character.");
      if (useSocialStore.getState().view?.profile.id !== owner) throw new Error("Your profile is reconnecting. Try again.");
      useSocialStore.getState().acknowledgeCharacter(profile);
      useUIStore.getState().setScreen("main");
    });
  }

  const label = choosingCharacter ? showCreate ? "Create your character" : "Choose your character" : entry === "login" ? "Log in"
    : entry === "register" ? "Register" : entry === "guest" ? "Continue as guest" : "Welcome to Avensky";

  return (
    <main className="welcome-screen" ref={root} data-controller-rows onKeyDown={event => {
      if (event.key === "Escape") back();
      if (!isTypingTarget(event.target) && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)) {
        event.preventDefault();
        navigateFormRows(root.current!, event.target as HTMLElement, event.key.slice(5).toLowerCase() as MenuAction, remembered.current);
      }
    }}>
      <MenuFlareBackground />
      <div className="welcome-art" aria-hidden="true">
        <img src="/images/avensky-welcome.webp" width={1280} height={853} alt="" fetchPriority="high" />
      </div>
      <section className="welcome-panel" aria-label={label}>
        <h1>{label}</h1>
        {choosingCharacter ? <>
          {player && !slots && <p role="status" className="welcome-help">Character selection needs the updated game server.</p>}
          {showCreate ? <form key="new-character" onSubmit={event => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("characterName") ?? "").trim();
            if (selectedStyle) enter("character_create", { name, body, style: selectedStyle });
          }}>
            <label data-controller-row>Character name
              <input name="characterName" autoComplete="nickname" minLength={2} maxLength={24} disabled={busy} required />
            </label>
            <div className="welcome-actions" role="group" aria-label="Body" data-controller-row>
              {(["female", "male"] as const).map(option => <button type="button" key={option} disabled={busy}
                aria-pressed={selectedStyle !== "original" && body === option} onClick={() => {
                  setBody(option);
                  if (selectedStyle === "original") setStyle(CHARACTER_STYLES[0].id);
                }}>{option === "female" ? "Female" : "Male"}</button>)}
            </div>
            <div className="welcome-characters" role="group" aria-label="Styles and attitudes" data-controller-row>
              {original && <button type="button" className="welcome-character" aria-pressed={selectedStyle === "original"}
                disabled={busy} onClick={() => setStyle("original")}><CharacterPortrait choice={original} compact /><strong>Keep current look</strong></button>}
              {CHARACTER_STYLES.map(item => {
                const choice = styleLook(item, body);
                return <button type="button" key={item.id} className="welcome-character" aria-pressed={selectedStyle === item.id}
                  disabled={busy} onClick={() => { setStyle(item.id); setError(""); }}>
                  <CharacterPortrait choice={choice} compact />
                  <strong>{item.name}</strong><span>{attitudeName(item.attitude)}</span>
                </button>;
              })}
            </div>
            <div className="welcome-actions" data-controller-row>
              <button type="button" onClick={back} disabled={busy}>Back</button>
              <button type="submit" className="welcome-primary" disabled={!selectedStyle || busy || !connected}>Create character</button>
            </div>
          </form> : <>
            {slots && <div className="welcome-characters" role="group" aria-label="Saved characters" data-controller-row>
              {slots.map(slot => <button type="button" key={slot.id} className="welcome-character" disabled={busy}
                aria-pressed={active === slot.id} onClick={() => { setSelected(slot.id); setError(""); }}>
                <CharacterPortrait choice={slot.appearance ?? undefined} compact />
                <strong>{slot.name}</strong><span>{styleName(slot.style)} · Level {slot.level}</span>
              </button>)}
            </div>}
            <div className="welcome-actions" data-controller-row>
              <button type="button" onClick={back} disabled={busy}>Back</button>
              {registered && slots && slots.length < 4 &&
                <button type="button" onClick={() => { setCreating(true); setStyle(undefined); setError(""); }} disabled={busy}>New character</button>}
              <button type="button" className="welcome-primary" disabled={!active || !slots || busy || !connected}
                onClick={() => { if (active) enter("character_select", { character_id: active }); }}>Enter main menu</button>
            </div>
          </>}
        </> : entry ? (
          <form key={entry} method="post" onSubmit={authenticate}>
            {entry === "guest" && <label data-controller-row>Guest name
              <input name="name" autoComplete="nickname" maxLength={24} required />
            </label>}
            {entry !== "guest" && <>
              <label data-controller-row>Account name
                <input name="login" autoComplete="username" autoCapitalize="none" spellCheck={false}
                  minLength={3} maxLength={24} pattern={"[A-Za-z0-9_\\-]{3,24}"} required />
              </label>
              <label data-controller-row>Password
                <input name="password" type="password" autoComplete={entry === "register" ? "new-password" : "current-password"}
                  minLength={entry === "register" ? 15 : undefined} maxLength={256} required />
              </label>
              {entry === "register" && <p className="welcome-help">Use at least 15 characters. Save your password for signing in on another device.</p>}
            </>}
            <div className="welcome-actions" data-controller-row>
              <button type="button" onClick={back} disabled={busy}>Back</button>
              <button type="submit" className="welcome-primary" disabled={busy || !connected || !accounts}>{entry === "guest" ? "Choose character" : label}</button>
            </div>
          </form>
        ) : <>
          {profile && <div data-controller-row><button type="button" className="welcome-primary" disabled={busy || !accounts}
            onClick={() => { setError(""); setConfirmedProfile(profile.id); }}>Continue as {profile.name}</button></div>}
          <div className="welcome-entry-options" data-controller-row>
            <button type="button" disabled={busy || !accounts} onClick={() => { setError(""); setEntry("login"); }}>Log in</button>
            <button type="button" disabled={busy || !accounts || registered} onClick={() => { setError(""); setEntry("register"); }}>
              {profile && !registered ? "Register this profile" : "Register"}
            </button>
            <button type="button" disabled={busy || !accounts} onClick={() => { setError(""); setEntry("guest"); }}>Continue as guest</button>
          </div>
          {accounts && !profile && <p className="welcome-help">Create an account to keep your character and outfits across devices.</p>}
          {connected && !accounts && <p className="welcome-help">This welcome screen needs the updated game server.</p>}
        </>}
        {(busy || !connected || (choosingCharacter && !player)) && <p role="status" className="welcome-help">
          {working ? "Saving…" : restoring ? "Restoring your profile…" : "Connecting to the game server…"}
        </p>}
        {(error || restoreError) && <p role="alert" className="welcome-error">{error || restoreError}</p>}
      </section>
    </main>
  );
}
