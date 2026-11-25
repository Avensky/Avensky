import { GarageCredentialFields } from "./GarageCredentialFields";
import { GarageOrbitSurface } from "../preview/GarageOrbitSurface";
import { GameButton } from "../../components/GameButton";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { isTypingTarget, type MenuAction } from "../../controls/inputRouting";
import { requestSocial, selectAccount, signOutPlayerProfile } from "../../net/socialClient";
import { useUIStore } from "../../store/menus/uiStore";
import { useSocialStore, type PlayerProfile } from "../../store/social/socialStore";
import { characterLook } from "../characters/characterCatalog";
import { attitudeName, CHARACTER_STYLES, styleLook, styleName, type CharacterBody } from "../characters/characterStyles";
import { AlphaAccountPanel } from "../characters/AlphaAccountPanel";
import { CharacterPortrait, ProfilePortrait } from "../characters/CharacterPortrait";
import { openFieldKeyboard } from "../../components/text/openFieldKeyboard";
import { navigateFormRows } from "../social/formRows";
import { MenuBackButton } from "../../components/menus/MenuFrame";
import { garageBrandHeader } from "../../theme/garageEntry";
import { retryEntryConnection } from "../../net/rustSocket";
import { returnToStagingSignIn, sessionEndNotices } from "../../net/stagingAccount";
import { entryAssets, stagingAccountPortal } from "./config";
import "./welcomeScreen.css";

const chrome = { __html: garageBrandHeader(entryAssets) };

type Step = "welcome" | "create" | "register" | "characters";
type Draft = { name: string; body: CharacterBody; style: string };

async function waitForProfile(owner: string) {
  if (useSocialStore.getState().view?.profile.id === owner) return;
  await new Promise<void>((resolve, reject) => {
    const unsubscribe = useSocialStore.subscribe(state => {
      if (state.view?.profile.id === owner) {
        close();
        resolve();
      } else if (!state.available) {
        close();
        reject(new Error("Your game connection closed. Try again after reconnecting."));
      }
    });
    const timer = window.setTimeout(() => {
      close();
      reject(new Error("Your profile is still loading. Try again."));
    }, 4000);
    function close() { clearTimeout(timer); unsubscribe(); }
  });
}

export function WelcomeScreen() {
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const connected = useSocialStore(state => state.available);
  const accounts = useSocialStore(state => state.accountsAvailable);
  const stagingSignIn = useSocialStore(state => state.stagingSignIn);
  const restoring = useSocialStore(state => state.profileStatus === "restoring");
  const restoreError = useSocialStore(state => state.profileStatus === "error" ? state.message : "");
  const entryIssue = useSocialStore(state => state.entryIssue);
  const profile = useSocialStore(state => state.view?.profile);
  const registered = useSocialStore(state => state.registeredProfile);
  const [step, setStep] = useState<Step>("welcome");
  const [confirmedProfile, setConfirmedProfile] = useState<string>();
  const [newPlayer, setNewPlayer] = useState(false);
  const openedFromMenu = useUIStore(state => state.welcomeSection === "account");
  const [showSettings, setShowSettings] = useState(false);
  const [showAccountEntry, setShowAccountEntry] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState<CharacterBody>("female");
  const [style, setStyle] = useState<string>();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [connectionSlow, setConnectionSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const root = useRef<HTMLElement>(null);
  const remembered = useRef(new WeakMap<HTMLElement, number>());
  const signedIn = Boolean(profile && (stagingSignIn || (!stagingAccountPortal && registered)));
  const rememberedPlayer = step === "welcome" && (signedIn || (!stagingAccountPortal && !showAccountEntry && profile?.characters?.length)) ? profile : undefined;
  const player = rememberedPlayer ?? (profile && profile.id === confirmedProfile ? profile : undefined);
  const slots = player?.characters;
  const saved = player?.progression?.character;
  const screen = entryIssue || (stagingAccountPortal && !profile) ? "welcome"
    : rememberedPlayer ? (slots?.length === 0 ? "create" : "characters")
    : step === "characters" && slots?.length === 0 ? "create" : step;
  const original = slots?.length === 0 && characterLook(saved) ? saved : undefined;
  const selectedStyle = style ?? (original ? "original" : undefined);
  const draft: Draft | null = selectedStyle && name.trim().length >= 2 ? { name: name.trim(), body, style: selectedStyle } : null;
  const busy = working || restoring;
  const sessionPending = screen === "welcome" && Boolean(entryIssue || !connected || restoring || stagingSignIn || stagingAccountPortal);
  const accountRoot = signedIn && (screen === "characters" || (screen === "create" && !slots?.length));
  const accountOpen = accountRoot && stagingSignIn && (showSettings || openedFromMenu);
  const unconfirmedSignIn = stagingAccountPortal && connected && !stagingSignIn;
  const signInReason = entryIssue?.kind === "session-replaced" || entryIssue?.kind === "session-expired" ? entryIssue.kind : undefined;
  const showRecovery = sessionPending && Boolean(entryIssue || connectionSlow || unconfirmedSignIn || restoreError);

  function entryNotice() {
    if (signInReason) return sessionEndNotices[signInReason];
    if (entryIssue?.kind === "other-tab") return "This game is open in another tab. Close that tab to play here.";
    if (entryIssue?.kind === "server") return entryIssue.message;
    if (unconfirmedSignIn) return "The game server could not verify this sign-in.";
    if (restoreError) return restoreError;
    if (connected) return connectionSlow ? "Your characters are taking longer to load." : "Loading your characters…";
    if (connectionSlow) return "The game server is taking longer to respond.";
    return stagingAccountPortal ? "Signed in. Contacting the game server…" : "Contacting the game server…";
  }

  function recoverEntry() {
    setError("");
    if (signInReason) {
      void returnToStagingSignIn(false, signInReason).catch(() => setError("Couldn’t open sign-in. Check your connection and try again."));
      return;
    }
    setAttempt(previous => previous + 1);
    retryEntryConnection();
  }

  function back() {
    if (pending.current || restoring) return;
    if (accountOpen) {
      if (openedFromMenu) useUIStore.getState().setScreen("main");
      else setShowSettings(false);
      return;
    }
    // Never log out via Escape or controller Back. The explicit Log out
    // button is the only way to invalidate an active tester session.
    if (accountRoot) return;
    setError("");
    if (step === "register" && newPlayer) { setStep("create"); return; }
    if (screen === "create" && slots?.length) { setStep("characters"); return; }
    setConfirmedProfile(undefined);
    setStep("welcome");
    setShowAccountEntry(true);
    setNewPlayer(false);
    setBody("female");
    setStyle(undefined);
    setName("");
  }

  useEffect(() => {
    if (screen === "welcome") return;
    if (!busy && !window.matchMedia?.("(pointer: coarse)")?.matches
        && !root.current?.contains(document.activeElement))
      root.current?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)")?.focus({ preventScroll:true });
  }, [screen, busy, connected, accountOpen]);

  useEffect(() => {
    setConnectionSlow(false);
    if (!sessionPending) return;
    const timeout = window.setTimeout(() => setConnectionSlow(true), 6000);
    return () => window.clearTimeout(timeout);
  }, [sessionPending, attempt]);

  useEffect(() => {
    if (showRecovery) root.current?.querySelector<HTMLElement>(".garage-notices [role=button]")?.focus({ preventScroll:true });
  }, [showRecovery]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const container = root.current;
    if (!viewport || !container) return;
    const resize = () => {
      if (viewport.scale === 1) {
        container.style.setProperty("--welcome-height", `${viewport.height}px`);
        container.style.setProperty("--welcome-top", `${viewport.offsetTop}px`);
      }
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, []);

  useEffect(() => {
    function navigate(event: Event) {
      if (!root.current || (busy && !sessionPending)) return;
      const action = (event as CustomEvent<MenuAction>).detail;
      const active = root.current.contains(document.activeElement) ? document.activeElement :
        root.current.querySelector(".garage-field[data-selected=true] input") ?? document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      if (action === "back") back();
      else if (action === "activate" && root.current.contains(active)) {
        if (active.matches("button:enabled, [role=button]:not([aria-disabled=true]), summary, a[href]")) active.click();
        else if (active instanceof HTMLInputElement && active.closest(".garage-credentials")) openFieldKeyboard(active);
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
    if ((step !== "welcome" && step !== "register") || !connected || !accounts) return;
    const form = new FormData(event.currentTarget);
    const login = String(form.get("login") ?? "");
    const password = String(form.get("password") ?? "");
    void run(async () => {
      const accountName = draft?.name ?? profile?.name ?? login.trim().split("@")[0].slice(0, 24);
      const owner = await selectAccount({ login, password }, step === "register" ? accountName : undefined);
      if (step === "register" && newPlayer && draft) {
        await finishDraft(owner, draft);
      } else {
        setConfirmedProfile(owner);
        setStep("characters");
      }
    });
  }

  async function enter(owner: string, action: "character_create" | "character_select", fields: Draft | { character_id: string }) {
    await waitForProfile(owner);
    const confirmed = await requestSocial(action, fields);
    const savedProfile = confirmed.profile as PlayerProfile | undefined;
    if (savedProfile?.id !== owner || !savedProfile.active_character_id ||
        !Array.isArray(savedProfile.characters) || !savedProfile.characters.some(slot => slot.id === savedProfile.active_character_id) ||
        !characterLook(savedProfile.progression?.character)) throw new Error("The server did not confirm your character.");
    if (useSocialStore.getState().view?.profile.id !== owner) throw new Error("Your profile is reconnecting. Try again.");
    useSocialStore.getState().acknowledgeCharacter(savedProfile);
    useUIStore.getState().setScreen("main");
  }

  function finishDraft(owner: string, newCharacter: Draft) {
    // If the name is taken, return to the draft with this authenticated account.
    setConfirmedProfile(owner);
    setNewPlayer(false);
    setStep("create");
    return enter(owner, "character_create", newCharacter);
  }

  async function logOut() {
    if (await signOutPlayerProfile() === "portal") return;
    setConfirmedProfile(undefined);
    setStep("welcome");
    setShowAccountEntry(true);
    setNewPlayer(false);
    setName("");
    setStyle(undefined);
    setBody("female");
  }
  const navigation = accountRoot ? <>
    <button type="button" onClick={() => void run(logOut)} disabled={busy}>Log out</button>
    {stagingSignIn && <button type="button" onClick={() => setShowSettings(true)} disabled={busy}>Account</button>}
  </> : <MenuBackButton label="Back" onClick={back} disabled={busy} />;
  const labels: Record<Step, string> = {
    welcome: "Sign in", create: "Create your character", register: "Create an account", characters: "Saved characters",
  };
  const label = labels[screen];

  return <>
    <main className="welcome-screen garage-entry" ref={root} data-controller-rows onKeyDown={event => {
      if (event.key === "Tab") { event.preventDefault(); return; }
      if (event.key === "Escape") back();
      if ((["ArrowUp","ArrowDown"].includes(event.key) || !isTypingTarget(event.target) && ["ArrowLeft","ArrowRight"].includes(event.key))) {
        event.preventDefault();
        navigateFormRows(root.current!, (root.current!.contains(document.activeElement) ? document.activeElement : root.current!.querySelector(".garage-field[data-selected=true] input")) as HTMLElement, event.key.slice(5).toLowerCase() as MenuAction, remembered.current);
      }
    }}>
      <div className="welcome-chrome" dangerouslySetInnerHTML={chrome} />
      <div className="welcome-scroll">
      <div className={screen === "welcome" ? "garage-entry-body" : "welcome-layout"} data-step={accountOpen ? "account" : screen} data-session-pending={sessionPending || undefined}>
      {!accountOpen && (sessionPending || screen === "create" || screen === "characters") && <GarageOrbitSurface />}
      {!sessionPending && <section className={screen === "welcome" ? "garage-entry-card" : "welcome-panel"} aria-label={accountOpen ? "Account" : label}>
        {!accountOpen && screen !== "welcome" && screen !== "characters" && <h1>{label}</h1>}
        {accountOpen ? <>
          <div data-controller-row><MenuBackButton label="Back" onClick={back} /></div>
          <AlphaAccountPanel key={player?.id} tab="account" />
        </> : screen === "create" ? <form key="new-character" onSubmit={event => {
            event.preventDefault();
            if (!draft || !connected || !accounts) return;
            if (player) void run(() => enter(player.id, "character_create", draft));
            else if (newPlayer) setStep("register");
          }}>
            <label data-controller-row>Character name
              <input name="characterName" autoComplete="nickname" minLength={2} maxLength={24} disabled={busy} required
                value={name} onChange={event => { setName(event.target.value); setError(""); }} />
            </label>
            <div className="welcome-actions" role="group" aria-label="Gender" data-controller-row>
              {(["female", "male"] as const).map(option => <button type="button" key={option} disabled={busy}
                aria-pressed={selectedStyle !== "original" && body === option} onClick={() => {
                  setBody(option);
                  if (selectedStyle === "original") setStyle(CHARACTER_STYLES[0].id);
                }}>{option === "female" ? "Female" : "Male"}</button>)}
            </div>
            <div className="welcome-characters" role="group" aria-label="Personality" data-controller-row>
              {original && <button type="button" className="welcome-character" aria-pressed={selectedStyle === "original"}
                disabled={busy} onClick={() => setStyle("original")}><CharacterPortrait choice={original}
                  welcomePreview={selectedStyle === "original" ? "selected" : "candidate"} /><strong>Keep current look</strong></button>}
              {CHARACTER_STYLES.map(item => {
                const choice = styleLook(item, body);
                return <button type="button" key={item.id} className="welcome-character" aria-pressed={selectedStyle === item.id}
                  disabled={busy} onClick={() => { setStyle(item.id); setError(""); }}>
                  <CharacterPortrait choice={choice} welcomePreview={selectedStyle === item.id ? "selected" : "candidate"} />
                  <strong>{attitudeName(item.attitude)}</strong><span>{item.name}</span>
                </button>;
              })}
            </div>
            <div className="welcome-actions" data-controller-row>
              {navigation}
              <button type="submit" className="welcome-primary" disabled={!draft || busy || !connected || (!player && !newPlayer)}>
                {player ? "Create character" : "Continue"}
              </button>
            </div>
          </form> : screen === "characters" ? <>
            {player && !slots && <p role="status" className="welcome-help">Character selection needs the updated game server.</p>}
            {slots && <div className="welcome-characters" role="group" aria-label="Saved characters" data-controller-row>
              {slots.map(slot => <button type="button" key={slot.id} className="welcome-character"
                disabled={busy || !connected || !slot.appearance}
                onClick={() => { if (player) void run(() => enter(player.id, "character_select", { character_id: slot.id })); }}>
                <ProfilePortrait choice={slot.appearance ?? undefined} label={slot.name}
                  welcomePreview={player?.active_character_id === slot.id ? "selected" : "candidate"} />
                <div className="welcome-character-details"><strong>{slot.name}</strong>
                  <span>{styleName(slot.style)}</span><small>Level {slot.level}</small>
                  {player?.active_character_id === slot.id && <small>Current character</small>}
                </div>
              </button>)}
            </div>}
            <div className="welcome-actions" data-controller-row>
              {navigation}
              {registered && slots && slots.length < 4 &&
                <button type="button" onClick={() => {
                  if (player) setConfirmedProfile(player.id);
                  setStep("create"); setName(""); setStyle(undefined); setError("");
                }} disabled={busy}>New character</button>}
            </div>
          </> : screen === "register" ? (
          <form key={screen} method="post" onSubmit={authenticate}>
              <label data-controller-row>Email
                <input name="login" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
                  minLength={3} maxLength={254} required />
              </label>
              <label data-controller-row>Password
                <input name="password" type="password" autoComplete="new-password" minLength={15} maxLength={256} required />
              </label>
              <p className="welcome-help">Use at least 15 characters.</p>
            <div className="welcome-actions" data-controller-row>
              {navigation}
              <button type="submit" className="welcome-primary" disabled={busy || !connected || !accounts}>{label}</button>
            </div>
          </form>
        ) : <>
          <form className="garage-credentials" method="post" onSubmit={authenticate}>
            <GarageCredentialFields disabled={busy || !accounts} />
          </form>
          <div className="garage-recovery" data-controller-row>
            <GameButton variant="menu" aria-expanded={recoveryOpen} onPress={() => setRecoveryOpen(value => !value)}>
              Forgot password?
            </GameButton>
            {recoveryOpen && <p>Contact your game server operator to recover this account.</p>}
            {accounts && <GameButton variant="menu" disabled={busy} onPress={() => {
              setError("");
              if (profile && !registered && profile.characters?.length) setStep("register");
              else { setNewPlayer(true); setStep("create"); }
            }}>Sign up</GameButton>}
          </div>
          {connected && !accounts && <p className="welcome-help">This welcome screen needs the updated game server.</p>}
        </>}
      </section>}
      <aside className={screen === "welcome" ? "garage-notices" : "welcome-notices"} aria-label="Announcements and issues">
        {sessionPending ? <>
          <p role="status">{entryNotice()}</p>
          {showRecovery && <div data-controller-row className="welcome-connection-actions">
            <GameButton variant="menu" onPress={recoverEntry}>{signInReason ? "Return to sign-in" : "Reconnect"}</GameButton>
          </div>}
        </> : (busy || !connected || (confirmedProfile && !player)) && <p role="status" className="welcome-help">
          {working ? "Saving…" : restoring ? "Loading your characters…" : "Waiting for the game server…"}
        </p>}
        {(error || (restoreError && !sessionPending)) && <p role="alert" className="welcome-error">{error || restoreError}</p>}
      </aside>
      </div>
      </div>
    </main>
  </>;
}
