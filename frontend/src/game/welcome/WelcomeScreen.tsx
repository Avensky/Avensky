import { useEffect, useRef, useState, type FormEvent } from "react";
import { isTypingTarget, type MenuAction } from "../../controls/inputRouting";
import { requestSocial, selectAccount, selectGuestProfile } from "../../net/socialClient";
import { useUIStore } from "../../store/menus/uiStore";
import { useSelectionStore } from "../../store/selection/selectionStore";
import { vehicleCatalog } from "../../store/selection/vehicleCatalog";
import { useSocialStore } from "../../store/social/socialStore";
import { characterLook, starterDriverChoice, type CharacterChoice } from "../characters/characterCatalog";
import { driversForVehicle, findVehicleDriver } from "../characters/driverRoster";
import type { VehicleModelId } from "../../vehicles/tools/vehicleModelPaths";
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
  const roster = useSocialStore(state => state.view?.roster);
  const registered = useSocialStore(state => state.registeredProfile);
  const [entry, setEntry] = useState<Entry>();
  const [confirmedProfile, setConfirmedProfile] = useState<string>();
  const [vehicle, setVehicle] = useState<VehicleModelId>();
  const [draft, setDraft] = useState<CharacterChoice>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  const root = useRef<HTMLElement>(null);
  const remembered = useRef(new WeakMap<HTMLElement, number>());
  const choosingCharacter = confirmedProfile !== undefined;
  const player = choosingCharacter && profile?.id === confirmedProfile ? profile : undefined;
  const saved = player?.progression?.character;
  const savedDriver = findVehicleDriver(saved?.driver_id);
  const selectedVehicle = vehicle ?? savedDriver?.vehicle ?? vehicleCatalog[0].id;
  const choice = draft ?? (savedDriver?.vehicle === selectedVehicle && characterLook(saved) ? saved : undefined);
  const busy = working || restoring;

  function back() {
    if (pending.current || restoring) return;
    setConfirmedProfile(undefined);
    setEntry(undefined);
    setVehicle(undefined);
    setDraft(undefined);
    setError("");
  }

  useEffect(() => {
    root.current?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)")?.focus({ preventScroll:true });
  }, [entry, choosingCharacter, connected]);

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
    const name = String(form.get("name") ?? "").trim();
    const login = String(form.get("login") ?? "");
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

  function finish() {
    if (!player || !choice || !connected || !accounts) return;
    const owner = player.id;
    void run(async () => {
      if (useSocialStore.getState().view?.profile.id !== owner) throw new Error("Your profile is reconnecting. Try again.");
      if (draft) {
        const confirmed = await requestSocial("character_equip", { character: choice });
        const equipped = confirmed.character as CharacterChoice | undefined;
        if (!equipped || !characterLook(equipped)) throw new Error("The server did not confirm this character.");
        useSocialStore.getState().acknowledgeProgression(owner, progression => ({ ...progression, character: equipped }), confirmed);
      }
      if (useSocialStore.getState().view?.profile.id !== owner) throw new Error("Your profile is reconnecting. Try again.");
      const index = vehicleCatalog.findIndex(item => item.id === selectedVehicle);
      if (index !== -1) useSelectionStore.setState({ vehicleIndex:index });
      useUIStore.getState().setScreen("main");
    });
  }

  const label = choosingCharacter ? "Choose your character" : entry === "login" ? "Log in"
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
          {player && <p className="welcome-player">{player.name}</p>}
          {player && <div className="welcome-vehicle" data-controller-row>
            <label htmlFor="welcome-vehicle">Vehicle</label>
            <select id="welcome-vehicle" value={selectedVehicle} disabled={busy} onChange={event => {
              const selected = vehicleCatalog.find(item => item.id === event.currentTarget.value);
              if (selected) {
                setVehicle(selected.id);
                setDraft(undefined);
                setError("");
              }
            }}>
              {vehicleCatalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>}
          {player && <div className="welcome-characters" data-controller-row aria-label="Starter characters">
            {driversForVehicle(selectedVehicle, roster).map(driver => {
              const base = starterDriverChoice(driver);
              const selection = saved?.driver_id === driver.id && characterLook(saved) ? saved
                : selectedVehicle === "ae86" && !saved?.driver_id && saved?.id === base.id
                  ? { ...saved, driver_id: driver.id } : base;
              return <button type="button" key={driver.id} className="welcome-character" aria-pressed={choice?.driver_id === driver.id}
                disabled={busy} onClick={() => { setDraft(selection === saved ? undefined : selection); setError(""); }}>
                <CharacterPortrait choice={selection} welcomePreview={choice?.driver_id === driver.id ? "selected" : "candidate"} />
                <strong>{driver.name}</strong>
                <span>{driver.gender === "female" ? "Female" : "Male"}</span>
                <span className="welcome-driver-palette" aria-hidden="true">
                  <i style={{ backgroundColor:selection.appearance?.color ?? driver.color }} />
                  <i style={{ backgroundColor:selection.appearance?.accent ?? driver.accent }} />
                </span>
              </button>;
            })}
          </div>}
          <div className="welcome-actions" data-controller-row>
            <button type="button" onClick={back} disabled={busy}>Back</button>
            <button type="button" className="welcome-primary" disabled={!player || !choice || !accounts || busy} onClick={finish}>Enter main menu</button>
          </div>
        </> : entry ? (
          <form key={entry} method="post" onSubmit={authenticate}>
            {entry !== "login" && <label data-controller-row>Display name
              <input name="name" autoComplete="nickname" maxLength={24} defaultValue={entry === "register" ? profile?.name : undefined} required />
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
