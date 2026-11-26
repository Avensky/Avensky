import { GarageCredentialFields } from "./GarageCredentialFields";
import { GarageOrbitSurface } from "../preview/GarageOrbitSurface";
import { GameButton } from "../../components/GameButton";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { isTypingTarget, type MenuAction } from "../../controls/inputRouting";
import { requestSocial, selectAccount, signOutPlayerProfile } from "../../net/socialClient";
import { useUIStore } from "../../store/menus/uiStore";
import { savedCharacterAppearance, useSocialStore, type PlayerProfile } from "../../store/social/socialStore";
import { CHARACTERS, characterAppearance, characterLook, ROOK_ID, type CharacterChoice } from "../characters/characterCatalog";
import { CHARACTER_STYLES, creatorChoice, type CharacterBody } from "../characters/characterStyles";
import { CharacterCreator, CREATOR_STEPS } from "./CharacterCreator";
import { CharacterRoster } from "./CharacterRoster";
import type { GarageCharacterSelection } from "../preview/RosterGaragePreview";
import { openFieldKeyboard } from "../../components/text/openFieldKeyboard";
import { navigateFormRows } from "../social/formRows";
import { MenuBackButton } from "../../components/menus/MenuFrame";
import { GarageEntryHeader } from "./GarageEntryHeader";
import { retryEntryConnection } from "../../net/rustSocket";
import { returnToStagingSignIn, sessionEndNotices } from "../../net/stagingAccount";
import { stagingAccountPortal } from "./config";
import { prepareLocalEntryHandoff, beginLocalEntryHandoff, captureLocalLogout } from "./localEntryHandoff";
import "./welcomeScreen.css";

type Step = "welcome" | "create" | "register" | "characters";
type PendingAction = { kind: "submit" } | { kind: "logout"; player: PlayerProfile };
const GarageProfilePanel = lazy(() => import("../characters/GarageProfilePanel").then(module => ({ default: module.GarageProfilePanel })));
type Draft = { name: string; body: CharacterBody; style: string; character: CharacterChoice };
const starterStyle = CHARACTER_STYLES[0].id;

function initialDraft(original?: CharacterChoice) {
  return original ? { style: "original", choice: original } : { style: starterStyle, choice: creatorChoice(starterStyle, "female") };
}

async function waitForProfile(owner: string, confirmedSnapshot = false) {
  const ready = (state: ReturnType<typeof useSocialStore.getState>) =>
    state.view?.profile.id === owner && (!confirmedSnapshot || state.profileStatus === "ready");
  if (ready(useSocialStore.getState())) return;
  await new Promise<void>((resolve, reject) => {
    const unsubscribe = useSocialStore.subscribe(state => {
      if (ready(state)) {
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

export function WelcomeScreen({ onGarageCharacter }: {
  onGarageCharacter?: (selection?: GarageCharacterSelection | null) => void;
} = {}) {
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
  const [localLogin, setLocalLogin] = useState(false);
  const [confirmedProfile, setConfirmedProfile] = useState<string>();
  const [newPlayer, setNewPlayer] = useState(false);
  const openedFromMenu = useUIStore(state => state.welcomeSection === "account");
  const [showSettings, setShowSettings] = useState(false);
  const [showAccountEntry, setShowAccountEntry] = useState(false);
  const [name, setName] = useState("");
  const [creation, setCreation] = useState(() => initialDraft());
  const [creatorStep, setCreatorStep] = useState<typeof CREATOR_STEPS[number]>("gender");
  const [previewStyle, setPreviewStyle] = useState<string>();
  const [preview, setPreview] = useState<{ owner: string; slotId: string }>();
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [connectionSlow, setConnectionSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const root = useRef<HTMLElement>(null);
  const logoutReveal = useRef<() => void>(undefined);
  const wasProfileOpen = useRef(false);
  const remembered = useRef(new WeakMap<HTMLElement, number>());
  // Revoking a session can close the socket before its HTTP response arrives.
  // Keep the outgoing roster visible with its controls disabled until sign-in takes over.
  const leavingPlayer = pendingAction?.kind === "logout" ? pendingAction.player : undefined;
  const signedIn = !localLogin && Boolean(profile && (stagingSignIn || (!stagingAccountPortal && registered)));
  const rememberedPlayer = step === "welcome" && (signedIn || (!stagingAccountPortal && !showAccountEntry && profile?.characters?.length)) ? profile : undefined;
  const player = leavingPlayer ?? rememberedPlayer ?? (profile && profile.id === confirmedProfile ? profile : undefined);
  const slots = player?.characters;
  const saved = player?.progression?.character;
  const screen = leavingPlayer ? "characters" : localLogin || entryIssue || (stagingAccountPortal && !profile) ? "welcome"
    : rememberedPlayer ? "characters" : step;
  const selectedSlot = (preview?.owner === player?.id && slots?.find(slot => slot.id === preview?.slotId))
    || slots?.find(slot => slot.id === (player?.active_character_id ?? player?.id)) || slots?.[0];
  const slotLimit = registered || stagingSignIn || leavingPlayer ? 4 : 1;
  const original = slots?.length === 0 && saved && characterLook(saved) ? saved : undefined;
  const body: CharacterBody = creation.choice.id === ROOK_ID ? "male" : "female";
  // An adopted career can keep its existing outfit. Restoring it from another
  // personality must respect the rig and the player's earlier color choices.
  const originalLook = useMemo(() => {
    if (!original || original.id !== creation.choice.id) return undefined;
    if (creation.style === "original") return creation.choice;
    const { skin, hair_color, makeup } = characterAppearance(creation.choice);
    return { ...original, appearance: { ...characterAppearance(original), skin, hair_color, makeup } };
  }, [original, creation]);
  const facePreview = useMemo<CharacterChoice>(() => {
    const { choice } = creation;
    const rig = CHARACTERS.find(item => item.id === choice.id);
    const face = characterAppearance(choice);
    // The first five steps need only the base rig and the chosen face colors.
    // An outfit or fitted hairstyle is requested when its class is actually shown.
    return { id: choice.id, identity: choice.identity, outfit: rig?.outfits[0].id ?? choice.outfit,
      appearance: { hair: "natural", headwear: "none", color: "original", skin: face.skin, hair_color: face.hair_color,
        makeup: face.makeup, eye_color: face.eye_color, brow_color: face.brow_color } };
  }, [creation]);
  const draftLook = useMemo(() => {
    if (creatorStep !== "personality") return facePreview;
    if (!previewStyle || previewStyle === creation.style) return creation.choice;
    if (previewStyle === "original" && originalLook) return originalLook;
    return creatorChoice(previewStyle, body, creation.choice);
  }, [creatorStep, previewStyle, creation, originalLook, body, facePreview]);
  const previewChoice = screen === "create" ? draftLook : player && selectedSlot ? savedCharacterAppearance(player, selectedSlot) : undefined;
  const draft: Draft | null = name.trim().length >= 2 ? { name: name.trim(), body, style: creation.style, character: creation.choice } : null;
  const working = pendingAction !== null;
  const busy = working || restoring;
  const sessionPending = !localLogin && screen === "welcome" && Boolean(entryIssue || !connected || restoring || stagingSignIn || stagingAccountPortal);
  const accountRoot = (signedIn || Boolean(leavingPlayer)) && screen === "characters";
  useEffect(() => {
    // A remembered account may open the roster without visiting the local sign-in form.
    if (accountRoot && !stagingSignIn) prepareLocalEntryHandoff();
  }, [accountRoot, stagingSignIn]);
  useLayoutEffect(() => {
    if (!logoutReveal.current || busy || sessionPending || screen !== "welcome") return;
    const reveal = logoutReveal.current;
    logoutReveal.current = undefined;
    reveal();
  }, [busy, sessionPending, screen]);
  const accountOpen = accountRoot && (showSettings || openedFromMenu);
  const showBrand = screen === "characters" && !accountOpen ||
    !signedIn && (screen === "register" || (screen === "welcome" && !sessionPending));
  const garageMode = accountOpen ? "profile" : screen === "create" ? "create" : screen === "characters" ? "roster" : null;
  const creatorFrame = garageMode !== "create" ? undefined : creatorStep === "gender" ? "body" : creatorStep === "personality" ? "outfit" : "face";
  useLayoutEffect(() => {
    onGarageCharacter?.(previewChoice && garageMode ? { choice: previewChoice, mode: garageMode, creatorFrame } : null);
  }, [onGarageCharacter, previewChoice, garageMode, creatorFrame]);
  // The parent takes ownership of the confirmed career when the roster closes.
  useLayoutEffect(() => () => onGarageCharacter?.(undefined), [onGarageCharacter]);
  const unconfirmedSignIn = stagingAccountPortal && connected && !stagingSignIn;
  const signInReason = entryIssue?.kind === "session-replaced" || entryIssue?.kind === "session-expired" ? entryIssue.kind : undefined;
  const showRecovery = sessionPending && Boolean(entryIssue || connectionSlow || unconfirmedSignIn || restoreError);

  const fromPortal = useRef(document.documentElement.hasAttribute("data-entry-handoff"));
  useLayoutEffect(() => {
    if (!fromPortal.current) return;
    const next = sessionPending ? (showRecovery ? "recovery" : "pending")
      : screen === "characters" && previewChoice && !accountOpen ? "roster" : "ready";
    if (!sessionPending) {
      // If the connection was slow, the portal has already faded into the
      // recovery/status screen. Still introduce the roster when it finally arrives.
      if (!document.documentElement.hasAttribute("data-entry-handoff"))
        root.current?.querySelector(".character-roster")?.classList.add("garage-entry-incoming");
      fromPortal.current = false;
    }
    window.dispatchEvent(new CustomEvent("avensky:entry-view", { detail: next }));
  }, [sessionPending, showRecovery, screen, previewChoice, accountOpen]);

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

  function leaveProfile() {
    if (openedFromMenu) useUIStore.getState().setScreen("main");
    else setShowSettings(false);
  }

  function back(leaveCreator = false) {
    if (pending.current || restoring) return;
    if (accountOpen) {
      const profileBack = root.current?.querySelector<HTMLElement>("[data-profile-back]");
      if (profileBack) profileBack.click();
      else leaveProfile();
      return;
    }
    // Never log out via Escape or controller Back. The explicit Log out
    // button is the only way to invalidate an active tester session.
    if (accountRoot) return;
    setError("");
    if (step === "register" && newPlayer) { setStep("create"); return; }
    if (screen === "create") {
      const previous = CREATOR_STEPS[CREATOR_STEPS.indexOf(creatorStep) - 1];
      if (!leaveCreator && previous) { changeCreatorStep(previous); return; }
      if (player) { setStep("characters"); return; }
    }
    setConfirmedProfile(undefined);
    setStep("welcome");
    setShowAccountEntry(true);
    setNewPlayer(false);
    setName("");
  }

  useEffect(() => {
    const returningFromProfile = wasProfileOpen.current && !accountOpen;
    wasProfileOpen.current = accountOpen;
    function focusEntry() {
      if (root.current?.inert) return;
      if (screen === "welcome") return;
      if (busy || (!returningFromProfile && root.current?.contains(document.activeElement))) return;
      if (!accountOpen && screen === "characters") {
        const initial = root.current?.querySelector<HTMLElement>('[data-character-id][aria-pressed=true], [data-roster-create]:only-child');
        initial?.focus({ preventScroll: true });
      } else if (!window.matchMedia?.("(pointer: coarse)")?.matches) {
        root.current?.querySelector(".welcome-panel")?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled), [role=button]:not([aria-disabled=true])")?.focus({ preventScroll: true });
      }
    }
    focusEntry();
    window.addEventListener("avensky:entry-interactive", focusEntry);
    return () => window.removeEventListener("avensky:entry-interactive", focusEntry);
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
      if (!root.current || root.current.inert || (busy && !sessionPending)) return;
      const action = (event as CustomEvent<MenuAction>).detail;
      const active = root.current.contains(document.activeElement) ? document.activeElement :
        root.current.querySelector(".garage-field[data-selected=true] input") ?? document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      if (action === "back") back();
      else if (action === "activate" && root.current.contains(active)) {
        if (active.matches("button:enabled, [role=button]:not([aria-disabled=true]), [role=tab]:not([aria-disabled=true]), summary, a[href]")) active.click();
        else if (active instanceof HTMLInputElement) {
          if (active.readOnly) active.select();
          else openFieldKeyboard(active, active.name === "characterName" ? changeName : undefined);
        } else if (isTypingTarget(active)) active.focus();
      } else if (["up","down","left","right"].includes(action)) {
        navigateFormRows(root.current, active, action, remembered.current);
      }
    }
    window.addEventListener("avenlab:panel-action", navigate);
    return () => window.removeEventListener("avenlab:panel-action", navigate);
  });

  async function run(task: () => Promise<void>, action: PendingAction = { kind: "submit" }) {
    if (pending.current || restoring) return;
    pending.current = true;
    setPendingAction(action);
    setError("");
    try { await task(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not continue."); }
    finally { pending.current = false; setPendingAction(null); }
  }

  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((step !== "welcome" && step !== "register") || !connected || !accounts) return;
    const form = new FormData(event.currentTarget);
    const login = String(form.get("login") ?? "");
    const password = String(form.get("password") ?? "");
    const main = root.current;
    void run(async () => {
      if (step === "welcome" && !stagingAccountPortal && main) {
        // Keep the real form mounted through confirmation and the profile snapshot.
        // A rejected sign-in leaves both fields available for correction.
        setLocalLogin(true);
        prepareLocalEntryHandoff();
        try {
          const owner = await selectAccount({ login, password });
          await waitForProfile(owner, true);
          if (root.current !== main) return;
          beginLocalEntryHandoff(main);
          fromPortal.current = true;
          setConfirmedProfile(owner);
          setStep("characters");
        } finally {
          setLocalLogin(false);
        }
        return;
      }
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

  async function saveCharacter(owner: string, action: "character_create_styled" | "character_select", fields: Draft | { character_id: string }) {
    await waitForProfile(owner);
    const confirmed = await requestSocial(action, fields);
    const savedProfile = confirmed.profile as PlayerProfile | undefined;
    const activeSlot = savedProfile?.characters?.find(slot => slot.id === savedProfile.active_character_id);
    if (savedProfile?.id !== owner || !activeSlot || !characterLook(savedProfile.progression?.character))
      throw new Error("The server did not confirm your character.");
    if ("style" in fields && (activeSlot.style !== fields.style || activeSlot.name !== fields.name.replace(/ +/g, " ")))
      throw new Error("The server did not confirm the new character.");
    if ("character_id" in fields && activeSlot.id !== fields.character_id)
      throw new Error("The server did not confirm the selected character.");
    if (useSocialStore.getState().view?.profile.id !== owner) throw new Error("Your profile is reconnecting. Try again.");
    useSocialStore.getState().acknowledgeCharacter(savedProfile);
    if (action === "character_select") {
      useUIStore.getState().setScreen("main");
    } else {
      setPreview({ owner, slotId: activeSlot.id });
      setStep("characters");
      setName("");
    }
  }

  function finishDraft(owner: string, newCharacter: Draft) {
    // If the name is taken, return to the draft with this authenticated account.
    setConfirmedProfile(owner);
    setNewPlayer(false);
    setStep("create");
    return saveCharacter(owner, "character_create_styled", newCharacter);
  }

  async function logOut() {
    const main = root.current;
    const reveal = main && !stagingSignIn && !stagingAccountPortal ? captureLocalLogout(main) : undefined;
    if (await signOutPlayerProfile() === "portal" || root.current !== main) return;
    logoutReveal.current = reveal;
    setShowSettings(false);
    setConfirmedProfile(undefined);
    setStep("welcome");
    setShowAccountEntry(true);
    setNewPlayer(false);
    setName("");
  }
  const navigation = <MenuBackButton label="Back" onClick={() => back()} disabled={busy} />;
  function changeCreatorStep(next: typeof creatorStep) {
    setPreviewStyle(undefined);
    setCreatorStep(next);
  }
  function beginCreation(adopting?: CharacterChoice) {
    setCreation(initialDraft(adopting));
    changeCreatorStep("gender");
    setName("");
    setError("");
    setStep("create");
  }
  function openCreation() {
    if (!player || !slots || slots.length >= slotLimit) return;
    setConfirmedProfile(player.id);
    setNewPlayer(false);
    beginCreation(original);
  }
  function chooseBody(next: CharacterBody) {
    if (next === body) return;
    const style = creation.style === "original" ? starterStyle : creation.style;
    setCreation({ style, choice: creatorChoice(style, next, creation.choice) });
    setPreviewStyle(undefined);
  }
  function chooseStyle(style: string) {
    setPreviewStyle(undefined);
    if (style === creation.style) return;
    const choice = style === "original" && originalLook ? originalLook : creatorChoice(style, body, creation.choice);
    setCreation({ style, choice });
  }
  function changeName(value: string) {
    setName(value);
    setError("");
  }
  function createDraft() {
    if (!draft || !connected || !accounts || busy || creatorStep !== "personality") return;
    if (player) void run(() => saveCharacter(player.id, "character_create_styled", draft));
    else if (newPlayer) setStep("register");
  }
  const labels: Record<Step, string> = {
    welcome: "Sign in", create: "Create your character", register: "Create an account", characters: "Saved characters",
  };
  const label = labels[screen];
  const workingMessage = leavingPlayer ? "Logging out…" : localLogin ? "Signing in…" : "Saving…";

  return <>
    <main className="welcome-screen garage-entry" ref={root} data-logging-out={leavingPlayer ? true : undefined} data-controller-rows data-controller-form onKeyDown={event => {
      if (event.key === "Tab") { event.preventDefault(); return; }
      if (event.key === "Escape") {
        event.preventDefault();
        if (!event.repeat) back();
        return;
      }
      if ((["ArrowUp","ArrowDown"].includes(event.key) || !isTypingTarget(event.target) && ["ArrowLeft","ArrowRight"].includes(event.key))) {
        event.preventDefault();
        navigateFormRows(root.current!, (root.current!.contains(document.activeElement) ? document.activeElement : root.current!.querySelector(".garage-field[data-selected=true] input")) as HTMLElement, event.key.slice(5).toLowerCase() as MenuAction, remembered.current);
      }
    }}>
      <GarageEntryHeader showBrand={showBrand} account={accountRoot && player ? {
        profileOpen: accountOpen, busy, onLogOut: () => void run(logOut, { kind: "logout", player }),
        onProfile: () => { if (accountOpen) leaveProfile(); else setShowSettings(true); },
      } : undefined} />
      <div className="welcome-scroll">
      <div className={screen === "welcome" ? "garage-entry-body" : "welcome-layout"} data-step={accountOpen ? "account" : screen} data-session-pending={sessionPending || undefined}>
      {(sessionPending || screen === "create" || screen === "characters") && <GarageOrbitSurface />}
      {!sessionPending && <section className={accountOpen ? "welcome-profile" : screen === "welcome" ? "garage-entry-card" : screen === "create" ? "welcome-creator" : "welcome-panel"} aria-label={accountOpen ? "Profile" : label}>
        {!accountOpen && screen === "register" && <h1>{label}</h1>}
        {accountOpen ? <Suspense fallback={<p role="status">Loading profile…</p>}>
          <GarageProfilePanel key={player?.id} onBack={leaveProfile} />
        </Suspense> : screen === "create" ? <CharacterCreator step={creatorStep} onStep={changeCreatorStep}
          choice={creation.choice} facePreview={facePreview} previewStyle={previewStyle} onChoice={choice => setCreation(previous => ({ ...previous, choice }))}
          style={creation.style} onStyle={chooseStyle} onPreviewStyle={setPreviewStyle} onBody={chooseBody}
          name={name} onName={changeName} busy={busy} canSubmit={Boolean(draft && connected && accounts && (player || newPlayer))}
          onBack={() => back(true)} onSubmit={createDraft}
          submitLabel={player ? "Create character" : "Continue"} original={originalLook} />
        : screen === "characters" ? player && <CharacterRoster profile={player} selected={selectedSlot} limit={slotLimit}
            busy={busy} connected={connected}
            onChoose={slot => { setPreview({ owner: player.id, slotId: slot.id }); setError(""); }}
            onCreate={openCreation} onEnter={slot => void run(() =>
              saveCharacter(player.id, "character_select", { character_id: slot.id }))}
            onBack={accountRoot ? undefined : back} /> : screen === "register" ? (
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
          <form className="garage-credentials" method="post" onFocusCapture={prepareLocalEntryHandoff}
            onPointerDownCapture={prepareLocalEntryHandoff} onSubmit={authenticate}>
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
              else { setNewPlayer(true); beginCreation(); }
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
          {working ? workingMessage : restoring ? "Loading your characters…" : "Waiting for the game server…"}
        </p>}
        {(error || (restoreError && !sessionPending)) && <p role="alert" className="welcome-error">{error || restoreError}</p>}
      </aside>
      </div>
      </div>
    </main>
  </>;
}
