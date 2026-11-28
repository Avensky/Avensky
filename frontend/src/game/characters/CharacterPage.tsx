import { useScreenNotice } from "../../components/menus/ScreenNotice";
import { observeWorkshopViewport } from "../preview/workshopViewport";
import { isMirrorMakeupEmote, MAKEUP_EMOTES } from "./mirrorCheck";
import { useFittingTurnStore } from "./fittingControlsStore";
import { FitReview } from "./FitReview";
import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type FocusEvent, type Ref } from "react";
import { useShallow } from "zustand/react/shallow";
import { readLocalCharacter, writeLocalCharacter } from "./localOutfits";
import { ControllerAction } from "../../components/controller";
import { MenuBackButton } from "../../components/menus/MenuFrame";
import { requestSocial } from "../../net/socialClient";
import { canUseDeviceCharacter, selectActiveCharacterName, selectCharacterSlot, selectEquippedCharacter, useSocialStore } from "../../store/social/socialStore";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { canEditCharacter, useUIStore } from "../../store/menus/uiStore";
import { CHARACTERS, DEFAULT_CHARACTER, type CharacterAppearance, characterAppearance, characterLook, isEquippableOutfit, type CharacterChoice } from "./characterCatalog";
import { CharacterDetails } from "./CharacterDetails";
import { CharacterPortrait } from "./CharacterPortrait";
import { AlphaAccountPanel } from "./AlphaAccountPanel";
import { CHARACTER_CAMERAS, useCharacterPreviewStore } from "./characterPreviewStore";
import { EMOTE_GROUPS, LOOK_AWAY_EMOTE } from "./garageEmotes";
import { CharacterPosePack } from "./CharacterPosePack";
import { CharacterEmoteList, type PreviewEmote, type PreviewEmoteGroup } from "./CharacterEmoteList";
import { unlockVehicleAudio } from "../../audio/sharedAudio";
import { GARAGE_STATIONS } from "../preview/garageStations";
import { CHARACTER_PERSONALITIES, type AnimationFit } from "./characterPersonality";
import { FittingCameraSelect } from "./FittingCameraSelect";
import { FittingAngleRail, FittingPoseTools, FittingZoomRail } from "./FittingCameraToolbar";
import { DressingRoom, type WardrobeNavigation } from "./DressingRoom";
import { WardrobeBody } from "./WardrobeBody";
import { clothingColorKey, UNDERWEAR_PIECES } from "./clothingPieces";
import { PreviewToolIcon } from "../preview/PreviewToolIcon";
import { PreviewToolButton } from "../preview/PreviewToolButton";
import { FittingRotationControls } from "./FittingRotationControls";
import { characterTurnLocked } from "./characterPreviewStage";
import { PLAYER_ONBOARDING } from "../welcome/config";
import { useGarageDrive } from "../preview/garageDriveStore";
import { CLOSE_DRIVER_DOOR, CLOSE_PASSENGER_DOOR, ENTER_DRIVER, ENTER_PASSENGER, OPEN_DRIVER_DOOR, OPEN_PASSENGER_DOOR,
  PANEL_INTERACTIONS, SIT_IN_CHAIR, garageDoorForEmote, garagePanelForEmote } from "./garageInteractions";
import { CLOSE_BRZ_HOOD, OPEN_BRZ_HOOD, TWEAK_BRZ_ENGINE } from "./brzHoodMotion";
import { BRZ_GARAGE_ENABLED } from "../preview/brzCabin";
import { useVehicleStudioStore } from "../heroes/vehicleStudioStore";
import { EmoteCreator } from "./EmoteCreator";
import { CREATED_EMOTE_ID, readCreatedEmotes } from "./emoteAuthoring";

export const CHARACTER_TABS = [
  { id: "details", label: "Details" }, { id: "body", label: "Body" }, { id: "appearance", label: "Appearance" },
  { id: "emotes", label: "Emotes" },
  { id: "profile", label: "Profile" }, { id: "account", label: "Account" },
] as const;
export type CharacterTab = typeof CHARACTER_TABS[number]["id"];

const PREVIEW_CAST = CHARACTERS.map(item => ({ gender: item.gender, choice: { id: item.id, outfit: item.outfits[0].id } }));
const BODY_CAMERAS = ["Full body", "Hair", "Face", "Eyes", "Makeup", "Hands"] as const;
const COCKPIT_CAMERAS = ["Full body", "Whole car"] as const;
const EMOTE_PACKS = EMOTE_GROUPS.filter(group => group !== "Garage");
type EmoteSection = PreviewEmoteGroup | "Pose pack" | "Interactions" | "Creator";

function sameWardrobe(a: CharacterChoice["wardrobe"], b: CharacterChoice["wardrobe"]) {
  return a?.set === b?.set && a?.waist === b?.waist && a?.cut === b?.cut;
}

function samePieces(a: CharacterChoice["garments"], b: CharacterChoice["garments"]) {
  const slots = Object.keys(a ?? {}) as (keyof NonNullable<typeof a>)[];
  return slots.length === Object.keys(b ?? {}).length && slots.every(slot => a?.[slot] === b?.[slot]);
}

function revealCharacterControl(event: FocusEvent<HTMLElement>) {
  event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

function playEmote(item: PreviewEmote) {
  if (useCharacterPreviewStore.getState().brzExiting) return;
  if (item.id === "drive-honk") unlockVehicleAudio();
  const mirror = isMirrorMakeupEmote(item.id);
  const makeup = MAKEUP_EMOTES.some(emote => emote.id === item.id);
  if (mirror || makeup) useFittingTurnStore.setState({ characterYaw: 0 });
  useCharacterPreviewStore.setState(state => ({
    emote: { id: item.id },
    playbackPaused: false,
    loopEmote: false,
    cockpitError: null,
    ...(mirror ? { camera: "Whole car" } : makeup ? { camera: "Face", zoom: 1, focusRevision: state.focusRevision + 1 } : {}),
  }));
}

export function CharacterPage({ onPreview, onReady, tab, beforeClose, wardrobeNavigation }: {
  onPreview?: (choice: CharacterChoice | null) => void;
  onReady: (ready: boolean) => void;
  tab: CharacterTab;
  beforeClose: Ref<() => Promise<boolean>>;
  wardrobeNavigation?: Ref<WardrobeNavigation>;
}) {
  const page = useRef<HTMLDivElement>(null);
  const owner = useSocialStore(state => state.view?.profile.id ?? state.profileOwner);
  const slotId = useSocialStore(selectCharacterSlot);
  const connectedOwner = useSocialStore(state => state.view?.profile.id);
  const characterName = useSocialStore(selectActiveCharacterName);
  const bodyTattoosAvailable = useSocialStore(state => state.bodyTattoosAvailable);
  const saved = useSocialStore(selectEquippedCharacter);
  const deviceCharacter = useSocialStore(canUseDeviceCharacter);
  // Null is a supported profile awaiting setup. Older servers omit the field.
  const saveToProfile = Boolean(owner) && saved !== undefined;
  const editingAllowed = useUIStore(canEditCharacter);
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const hasDriverDoor = useGarageDrive(state => state.hasDoor);
  const availableParts = useVehicleStudioStore(state => state.availableParts);
  const hoodOpen = useVehicleStudioStore(state => state.parts.hood);
  const leftDoorOpen = useVehicleStudioStore(state => state.parts["door-left"]);
  const rightDoorOpen = useVehicleStudioStore(state => state.parts["door-right"]);
  const brzDoorReady = useCharacterPreviewStore(state => state.brzDoorReady);
  const brzDoorBusy = useCharacterPreviewStore(state => state.brzDoorBusy);
  const passengerAvailable = useCharacterPreviewStore(state => state.brzPassengerAvailable);
  const passengerSeated = useCharacterPreviewStore(state => state.insideCar && state.brzPassenger);
  const brzExitSupported = useCharacterPreviewStore(state => state.brzExitSupported);
  const brzExitReady = useCharacterPreviewStore(state => state.brzExitReady);
  const brzExiting = useCharacterPreviewStore(state => state.brzExiting);
  const brzEngineAvailable = useCharacterPreviewStore(state => state.brzEngineAvailable);
  const brzHoodBusy = useCharacterPreviewStore(state => state.brzHoodBusy);
  const ownerKey = owner ?? "this-device";
  const favoritesKey = "avensky-emote-favorites-v1:" + ownerKey;
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const entries: unknown = JSON.parse(localStorage.getItem(favoritesKey) ?? "[]");
      return Array.isArray(entries) ? entries.filter((id): id is string => typeof id === "string").slice(0, 200) : [];
    } catch { return []; }
  });
  const [createdEmotes, setCreatedEmotes] = useState(() => readCreatedEmotes(ownerKey));
  const [initialChoice] = useState(() => characterLook(saved) ? saved! : deviceCharacter ? readLocalCharacter() : undefined);
  const [choice, setChoice] = useState(initialChoice ?? DEFAULT_CHARACTER);
  const [trial, setTrial] = useState<CharacterChoice>();
  const [loadedOutfit, setLoadedOutfit] = useState(false);
  const activeTrial = trial?.id === choice.id ? trial : undefined;
  const wardrobeChoice = activeTrial ?? choice;
  const previewChoice = wardrobeChoice;
  const [locked, setLocked] = useState(Boolean(initialChoice));
  const [status, setStatus] = useState<"idle" | "pending" | "saving" | "saved" | "local" | "error">("idle");
  const notify = useScreenNotice();
  const announceEntry = useScreenNotice();
  const [emoteBrowserOpen, setEmoteBrowserOpen] = useState(false);
  const [emotePacksOpen, setEmotePacksOpen] = useState(false);
  const [emoteGroup, setEmoteGroup] = useState<EmoteSection>();
  const [emoteSearch, setEmoteSearch] = useState("");
  const [emoteDetail, setEmoteDetail] = useState<PreviewEmote>();
  const emoteBrowserId = useId();
  const emotePacksId = useId();
  const emoteResultsId = useId();
  const emoteFocus = useRef<string>(null);
  const selectedPreview = useRef<ReturnType<typeof useCharacterPreviewStore.getState>["emote"]>(null);
  const acknowledged = useRef(locked ? choice : null);
  const queued = useRef(new Map<string, CharacterChoice>());
  const running = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { character, outfit, appearance } = characterLook(previewChoice)!;
  const { camera, emote, playbackPaused, loopEmote, cockpitVehicle, cockpitAvailable, cockpitError, insideCar, leanAvailable, mirrorAvailable } = useCharacterPreviewStore(useShallow(state => ({
    camera: state.camera, emote: state.emote, playbackPaused: state.playbackPaused,
    cockpitVehicle: state.cockpitVehicle, cockpitAvailable: state.cockpitAvailable, cockpitError: state.cockpitError,
    insideCar: state.insideCar, leanAvailable: state.leanAvailable, mirrorAvailable: state.mirrorAvailable, loopEmote: state.loopEmote,
  })));

  useEffect(() => {
    if (!locked) return;
    const name = selectActiveCharacterName(useSocialStore.getState());
    announceEntry(name ?? "Fitting room", "status", name ? "Fitting room" : undefined);
  }, [locked, announceEntry]);

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    if (running.current) return running.current;
    if (!queued.current.size) return Promise.resolve(true);
    const drain = async () => {
      setStatus("saving");
      notify("Saving…");
      while (queued.current.size) {
        if (!canEditCharacter()) return false;
        const [id, next] = queued.current.entries().next().value!;
        queued.current.delete(id);
        try {
          if (!owner || useSocialStore.getState().view?.profile.id !== owner) throw Error("Connect your player profile to save.");
          if (selectCharacterSlot(useSocialStore.getState()) !== slotId) return false;
          const result = await requestSocial("character_equip", { character: next, character_slot_id: slotId ?? undefined });
          const confirmed = result.character as CharacterChoice | undefined;
          const profile = useSocialStore.getState();
          if (selectCharacterSlot(profile) !== slotId) return false;
          if (profile.view?.profile.id !== owner || !confirmed || confirmed.id !== next.id || !characterLook(confirmed)) {
            throw Error("The server did not confirm the equipped outfit. Reconnect and retry the save.");
          }
          profile.acknowledgeProgression(owner, progression => ({ ...progression, character: confirmed }), result);
          acknowledged.current = useSocialStore.getState().view?.profile.progression?.character ?? confirmed;
          setLocked(true);
        } catch (error) {
          // Keep another model's pending edits and the order in which the player selected them.
          if (!queued.current.has(id)) queued.current = new Map([[id, next], ...queued.current]);
          setStatus("error");
          const detail = error instanceof Error ? error.message : "Could not save your character.";
          notify(detail);
          return false;
        }
      }
      if (acknowledged.current) setChoice(acknowledged.current);
      setStatus("saved");
      notify("Saved to your profile.");
      return true;
    };
    running.current = drain().finally(() => { running.current = null; });
    return running.current;
  }, [owner, slotId, notify]);

  useLayoutEffect(() => {
    if (saved && characterLook(saved) && !running.current && !queued.current.size) {
      acknowledged.current = saved;
      setChoice(saved);
      setLocked(true);
    }
  }, [saved]);
  useEffect(() => {
    if (editingAllowed && connectedOwner && queued.current.size) void flush();
  }, [editingAllowed, connectedOwner, flush]);
  useImperativeHandle(beforeClose, () => () => {
    if (locked && !saveToProfile && status === "error") return Promise.resolve(false);
    return locked ? flush() : running.current ?? Promise.resolve(true);
  }, [flush, locked, saveToProfile, status]);
  useLayoutEffect(() => { onPreview?.(previewChoice); }, [previewChoice, onPreview]);
  useLayoutEffect(() => { onReady(locked); }, [locked, onReady]);
  useLayoutEffect(() => {
    if (tab !== "emotes") return;
    if (locked) {
      setEmoteBrowserOpen(true);
      setEmoteGroup("Gestures");
    }
    useFittingTurnStore.setState({ characterYaw: 0 });
    useCharacterPreviewStore.setState(state => ({ camera: "Full body", zoom: 1, focusRevision: state.focusRevision + 1 }));
    return () => useCharacterPreviewStore.setState({ emote: null, loopEmote: false, automaticEmotes: true, insideCar: false, cockpitError: null });
  }, [tab, locked]);
  useLayoutEffect(() => () => {
    setEmoteBrowserOpen(false);
    setEmotePacksOpen(false);
    setEmoteGroup(undefined);
    setEmoteDetail(undefined);
    setEmoteSearch("");
    selectedPreview.current = null;
  }, [locked, tab]);
  useLayoutEffect(() => {
    if (emote) selectedPreview.current = emote;
  }, [emote]);
  useLayoutEffect(() => {
    if (!emoteFocus.current) return;
    page.current?.querySelector<HTMLElement>(emoteFocus.current)?.focus();
    emoteFocus.current = null;
  }, [emoteBrowserOpen, emoteGroup, emoteDetail, insideCar]);
  useLayoutEffect(() => {
    if (insideCar && (reducedMotion || (locked && tab !== "emotes"))) {
      useCharacterPreviewStore.setState({ insideCar: false, emote: null });
    }
  }, [locked, tab, reducedMotion, insideCar]);
  useLayoutEffect(() => () => {
    clearTimeout(timer.current);
    queued.current.clear();
  }, []);
  useEffect(() => () => {
    onPreview?.(null);
    onReady(false);
    useCharacterPreviewStore.setState({ camera: "Full body", zoom: 1, emote: null, insideCar: false, cockpitError: null });
  }, [onPreview, onReady]);

  function saveLocalCharacter(next: CharacterChoice) {
    if (!canEditCharacter()) return;
    try {
      writeLocalCharacter(next);
      acknowledged.current = next;
      setStatus("local");
      notify("Saved on this device.");
      setLocked(true);
    } catch {
      setStatus("error");
      notify("Browser storage could not save this character.");
    }
  }

  function update(next: CharacterChoice, preview?: CharacterChoice) {
    if (!canEditCharacter()) return;
    if (PLAYER_ONBOARDING && next.id === choice.id && choice.driver_id) {
      next = { ...next, driver_id: choice.driver_id };
    }
    if (preview) setTrial(preview);
    else clearFittingPreview();
    setChoice(next);
    if (!locked) return;
    if (!saveToProfile) {
      saveLocalCharacter(next);
      return;
    }
    queued.current.delete(next.id);
    queued.current.set(next.id, next);
    setStatus("pending");
    notify("Saving…");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 300);
  }

  function hasFittingPreview(next: CharacterChoice, fromSavedOutfit = loadedOutfit) {
    return fromSavedOutfit || next.outfit !== choice.outfit || !sameWardrobe(next.wardrobe, choice.wardrobe)
      || !sameWardrobe(next.wardrobeTrial, choice.wardrobeTrial) || next.wardrobeEase !== choice.wardrobeEase
      || next.bra !== choice.bra || !samePieces(next.garments, choice.garments)
      || (next.removedClothing?.length ?? 0) !== (choice.removedClothing?.length ?? 0)
      || next.removedClothing?.some(piece => !choice.removedClothing?.includes(piece))
      || (next.appearance?.briefs_style ?? "briefs") !== (choice.appearance?.briefs_style ?? "briefs")
      || UNDERWEAR_PIECES.some(piece => {
        const key = clothingColorKey(next, piece);
        const preview = next.appearance?.item_colors?.[key];
        const equipped = choice.appearance?.item_colors?.[key];
        return preview?.color !== equipped?.color || preview?.accent !== equipped?.accent;
      });
  }

  function tryOn(next: CharacterChoice) {
    if (!canEditCharacter()) return;
    setTrial(hasFittingPreview(next) ? next : undefined);
  }

  function previewOutfit(next: CharacterChoice) {
    if (!canEditCharacter()) return;
    setLoadedOutfit(false);
    // Start a fresh outfit from the equipped body and dyes. A different
    // fitting-room trial may have colors that have never been equipped.
    const fresh = activeTrial ? { ...next, appearance: { ...characterAppearance(choice),
      color: next.appearance?.color ?? "original", accent: next.appearance?.accent } } : next;
    setTrial(hasFittingPreview(fresh, false) ? fresh : undefined);
  }

  function loadOutfit(next: CharacterChoice) {
    if (!canEditCharacter()) return;
    setLoadedOutfit(true);
    setTrial(next);
    useCharacterPreviewStore.setState({ camera: "Full body", zoom: 1 });
  }

  function clearFittingPreview() {
    setLoadedOutfit(false);
    setTrial(undefined);
  }

  function endOutfitPreview() {
    if (canEditCharacter()) clearFittingPreview();
  }

  function editPreviewAppearance(next: CharacterChoice) {
    if (!canEditCharacter()) return;
    if (activeTrial) setTrial(next);
    else update(next);
  }

  function saveClothingColors(next: CharacterChoice) {
    if (activeTrial && (loadedOutfit || activeTrial.outfit !== choice.outfit || !sameWardrobe(activeTrial.wardrobe, choice.wardrobe))) {
      editPreviewAppearance(next);
      return;
    }
    const itemColors = next.appearance?.item_colors;
    const previousColors = characterAppearance(previewChoice).item_colors;
    const keys = ["underwear:bra", "underwear:briefs"] as const;
    const changed = keys.filter(key => previousColors?.[key] !== itemColors?.[key]);
    if (!changed.length) {
      editPreviewAppearance(next);
      return;
    }
    const item_colors = { ...characterAppearance(choice).item_colors };
    for (const key of changed) {
      const colors = itemColors?.[key];
      if (colors) item_colors[key] = colors;
      else delete item_colors[key];
    }
    update({ ...choice, appearance: { ...characterAppearance(choice), item_colors } }, activeTrial ? next : undefined);
  }

  function editBodyAppearance(change: Partial<CharacterAppearance>) {
    const next = { ...choice, appearance: { ...(choice.appearance ?? characterAppearance(choice)), ...change } };
    const preview = activeTrial && { ...activeTrial, appearance: { ...(activeTrial.appearance ?? appearance), ...change } };
    update(next, preview);
  }

  const equipPreview = activeTrial && isEquippableOutfit(activeTrial)
    ? {
        disabled: !editingAllowed || (saveToProfile && !connectedOwner) || status === "saving",
        hint: !saveToProfile ? "This device only. Sign in to save outfits to a player profile."
          : !connectedOwner ? "Reconnect your player profile to equip." : undefined,
        onEquip: () => {
          if (!canEditCharacter() || (saveToProfile && !connectedOwner) || running.current) return;
          update(activeTrial);
          if (saveToProfile) void flush();
        },
      }
    : undefined;

  const modelPicker = <div className="character-cast" role="group" aria-label="Gender" data-controller-row>
    {PREVIEW_CAST.map(({ gender, choice: next }) => <button key={next.id} type="button" className="menu-control"
      disabled={status === "saving"} data-character-option={next.id} aria-pressed={choice.id === next.id}
      onClick={() => {
        if (next.id === choice.id) return;
        useCharacterPreviewStore.setState({ emote: null });
        const state = useSocialStore.getState();
        const progression = state.view?.profile.progression ?? state.cachedCosmetics;
        const preset = progression?.character?.id === next.id ? progression.character : progression?.character_presets?.[next.id];
        update(preset && characterLook(preset) ? preset : next);
      }}>
      <CharacterPortrait choice={next} />
      <span>{gender === "female" ? "Female" : "Male"}</span>
    </button>)}
  </div>;
  const bag = Boolean(previewChoice.prop);
  const canEnterCar = !reducedMotion;
  const cockpitPending = insideCar && !cockpitAvailable;
  const station = cockpitVehicle ? GARAGE_STATIONS[cockpitVehicle] : null;
  const stagingBrz = BRZ_GARAGE_ENABLED && cockpitVehicle === "brz";
  const animatedExit = insideCar && stagingBrz && brzExitSupported && !reducedMotion;
  const stationName = passengerSeated ? "passenger seat" : station?.kind === "bridge" ? "bridge" : station?.kind === "levers" ? "driver station" : "cockpit";
  const exitLabel = animatedExit ? passengerSeated ? "Get out of passenger seat" : "Get out of driver seat" : `Exit ${stationName}`;
  const exitDisabled = brzExiting || (animatedExit && !brzExitReady);
  const selectEmote = useCallback((item: PreviewEmote) => {
    playEmote(item);
    emoteFocus.current = ".character-emote-back";
    setEmoteDetail(item);
  }, []);
  function toggleCockpit() {
    if (brzExiting || (animatedExit && !brzExitReady)) return;
    setEmoteDetail(undefined);
    setEmoteSearch("");
    if (animatedExit) {
      useCharacterPreviewStore.setState({ brzExiting: true, emote: null, cockpitError: null, playbackPaused: false, camera: "Whole car", zoom: 1 });
      return;
    }
    if (!insideCar && stagingBrz && brzExitSupported && hasDriverDoor && !brzDoorReady) {
      previewInteraction(ENTER_DRIVER);
      return;
    }
    useCharacterPreviewStore.setState({ insideCar: !insideCar, brzPassenger: false, brzExitReady: false,
      emote: null, cockpitError: null, camera: "Full body", zoom: 1 });
  }
  function chooseEmoteGroup(group: typeof emoteGroup) {
    if (brzExiting) return;
    selectedPreview.current = null;
    setEmoteGroup(emoteGroup === group ? undefined : group);
    setEmoteDetail(undefined);
    setEmoteSearch("");
    if ((group === "Garage" || group === "Pose pack" || group === "Interactions" || group === "Creator") && emoteGroup !== group) {
      useFittingTurnStore.setState({ characterYaw: 0 });
      useCharacterPreviewStore.setState(state => ({
        camera: "Full body", zoom: 1, emote: null, insideCar: false, focusRevision: state.focusRevision + 1,
      }));
    } else useCharacterPreviewStore.setState({ emote: null });
  }
  function toggleEmoteBrowser() {
    if (emoteBrowserOpen) {
      chooseEmoteGroup(undefined);
      setEmotePacksOpen(false);
      if (insideCar) toggleCockpit();
    }
    setEmoteBrowserOpen(!emoteBrowserOpen);
  }
  const toggleFavorite = useCallback((id: string) => {
    const next = favorites.includes(id) ? favorites.filter(item => item !== id) : [id, ...favorites].slice(0, 200);
    setFavorites(next);
    try { localStorage.setItem(favoritesKey, JSON.stringify(next)); } catch { /* Keep this session's list. */ }
  }, [favorites, favoritesKey]);
  function previewInteraction(id: string) {
    if (brzExiting) return;
    useFittingTurnStore.setState({ characterYaw: 0 });
    useCharacterPreviewStore.setState(state => ({
      emote: { id }, playbackPaused: false, loopEmote: false, insideCar: false, brzPassenger: false, cockpitError: null, brzDoorReady: false,
      camera: garageDoorForEmote(id) || garagePanelForEmote(id) ? "Whole car" : "Full body", zoom: 1, focusRevision: state.focusRevision + 1,
    }));
  }
  function emoteCategory(group: NonNullable<typeof emoteGroup>, label: string = group) {
    return <button key={group} type="button" className="menu-control character-emote-disclosure" data-controller-row data-emote-group={group}
      aria-expanded={emoteGroup === group} aria-controls={emoteResultsId} onClick={() => chooseEmoteGroup(group)}>{label}</button>;
  }
  const emoteBrowser = <>
    <button type="button" className="menu-control character-emote-disclosure character-emote-toggle" data-controller-row
      aria-expanded={emoteBrowserOpen} aria-controls={emoteBrowserId} onClick={toggleEmoteBrowser}>Preview emotes</button>
    <div id={emoteBrowserId} className="character-emote-browser" hidden={!emoteBrowserOpen}>
      {locked && <label className="character-setting" data-controller-row>Clothing fit<select className="menu-control" aria-label="Animation clothing fit" value={appearance.animation_fit ?? "auto"}
        onChange={event => editPreviewAppearance({ ...previewChoice, appearance: { ...appearance, animation_fit: event.target.value as AnimationFit } })}>
        <option value="auto">Auto · match outfit</option><option value="full">Full skirt · more room</option><option value="fitted">Fitted · relaxed arms</option>
      </select></label>}
      {!insideCar && <>
        <div className="character-emote-categories" role="group" aria-label="Emote library">
          {emoteCategory("Favorites")}{emoteCategory("Gestures")}{emoteCategory("Pose pack", "Poses")}{emoteCategory("Interactions")}
          {emoteCategory("Garage")}{emoteCategory("Best")}{emoteCategory("All")}
        </div>
        {emoteCategory("Creator", "Create emote")}
        {createdEmotes.length > 0 && <label className="character-setting" data-controller-row>My emotes
          <select className="menu-control" value="" disabled={reducedMotion} onChange={event => {
            const created = createdEmotes.find(item => item.id === event.target.value);
            if (created) useCharacterPreviewStore.setState({ emote: { id: CREATED_EMOTE_ID, created }, playbackPaused: false, loopEmote: false, cockpitError: null });
          }}><option value="">Play a saved emote</option>{createdEmotes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </label>}
        <div className="character-emote-categories" role="group" aria-label="Personality emotes">
          {emoteCategory("Personality", "My personality")}
          {CHARACTER_PERSONALITIES.map(item => emoteCategory(item.id, item.label))}
        </div>
        <button type="button" className="menu-control character-emote-disclosure" data-controller-row
          aria-expanded={emotePacksOpen} aria-controls={emotePacksId} onClick={() => {
            if (emotePacksOpen && EMOTE_PACKS.includes(emoteGroup as typeof EMOTE_PACKS[number])) chooseEmoteGroup(undefined);
            setEmotePacksOpen(!emotePacksOpen);
          }}>Collections</button>
        <div id={emotePacksId} className="character-emote-categories" role="group" aria-label="Emote collection" hidden={!emotePacksOpen}>
          {EMOTE_PACKS.map(group => emoteCategory(group))}
        </div>
        <button type="button" className="menu-control" data-controller-row data-cockpit-toggle disabled={!canEnterCar || !cockpitVehicle || brzDoorBusy}
          onClick={toggleCockpit}>Enter {stationName}</button>
      </>}
      {insideCar && !locked && <button type="button" className="menu-control" data-controller-row data-cockpit-toggle
        disabled={exitDisabled} onClick={toggleCockpit}>{exitLabel}</button>}
      {reducedMotion && <p>Emote playback is paused by Reduced Motion.</p>}
      {cockpitError && <p role="status">{cockpitError}</p>}
      {cockpitPending && <p role="status">Preparing the {stationName}…</p>}
      {brzExiting && <p role="status">Getting out…</p>}
      {insideCar && bag && <p>Handheld props are stowed while driving.</p>}
    </div>
  </>;
  const resultsOpen = emoteBrowserOpen && (insideCar || !!emoteGroup);
  const emoteResults = resultsOpen && (emoteDetail ? <>
    <div data-controller-row>
      <MenuBackButton className="character-emote-back" label="Back to emotes" onClick={() => {
        emoteFocus.current = `[data-emote-id="${emoteDetail.id}"]`;
        setEmoteDetail(undefined);
      }}>Back to emotes</MenuBackButton>
    </div>
    <h2>{emoteDetail.name}</h2>
    <button type="button" className="menu-control" data-controller-row disabled={reducedMotion || cockpitPending}
      onClick={() => playEmote(emoteDetail)}>Replay emote</button>
    <FitReview choice={previewChoice} pose={emoteDetail.id} poseLabel={emoteDetail.name}
      subject={{ id: emoteDetail.id, label: emoteDetail.name, kind: "emote" }} />
  </> : passengerSeated ? <h2>Passenger seat</h2>
    : !insideCar && emoteGroup === "Creator" ? <EmoteCreator disabled={reducedMotion} owner={ownerKey} saved={createdEmotes} onSave={setCreatedEmotes} />
    : !insideCar && emoteGroup === "Interactions" ? <div className="character-emote-results">
      <h2>Interactions</h2>
      <button type="button" className="menu-control" data-controller-row
        disabled={brzExiting || reducedMotion || !hasDriverDoor || !cockpitAvailable || (stagingBrz && brzDoorBusy)}
        onClick={() => previewInteraction(stagingBrz && leftDoorOpen ? CLOSE_DRIVER_DOOR : OPEN_DRIVER_DOOR)}>
        {stagingBrz && leftDoorOpen ? "Close driver door" : "Open driver door"}
      </button>
      {stagingBrz && brzDoorReady && <button type="button" className="menu-control"
        data-controller-row disabled={!canEnterCar || brzExiting} onClick={toggleCockpit}>Get into the BRZ</button>}
      {stagingBrz && passengerAvailable && <>
        <button type="button" className="menu-control" data-controller-row disabled={brzExiting || reducedMotion || brzDoorBusy}
          onClick={() => previewInteraction(rightDoorOpen ? CLOSE_PASSENGER_DOOR : OPEN_PASSENGER_DOOR)}>
          {rightDoorOpen ? "Close passenger door" : "Open passenger door"}
        </button>
        <button type="button" className="menu-control" data-controller-row disabled={brzExiting || !canEnterCar || brzDoorBusy}
          onClick={() => previewInteraction(ENTER_PASSENGER)}>Get into passenger seat</button>
      </>}
      {!hasDriverDoor && <small>This vehicle has no fitted driver door.</small>}
      {PANEL_INTERACTIONS.map(action => <button key={action.id} type="button" className="menu-control" data-controller-row
        disabled={brzExiting || reducedMotion || !cockpitVehicle || !availableParts.includes(action.part)
          || (BRZ_GARAGE_ENABLED && cockpitVehicle === "brz" && action.part === "hood"
            && (brzHoodBusy || hoodOpen && action.id === OPEN_BRZ_HOOD))}
        onClick={() => previewInteraction(action.id)}>{action.label}</button>)}
      {BRZ_GARAGE_ENABLED && cockpitVehicle === "brz" && brzEngineAvailable && availableParts.includes("hood") && <button type="button"
        className="menu-control" data-controller-row disabled={brzExiting || reducedMotion || !hoodOpen || brzHoodBusy}
        onClick={() => previewInteraction(TWEAK_BRZ_ENGINE)}>Tweak engine</button>}
      {BRZ_GARAGE_ENABLED && cockpitVehicle === "brz" && availableParts.includes("hood") && <button type="button"
        className="menu-control" data-controller-row disabled={brzExiting || reducedMotion || !hoodOpen || brzHoodBusy}
        onClick={() => previewInteraction(CLOSE_BRZ_HOOD)}>Close hood</button>}
      <button type="button" className="menu-control" data-controller-row disabled={brzExiting || reducedMotion} onClick={() => previewInteraction(SIT_IN_CHAIR)}>Sit down</button>
      <button type="button" className="menu-control" data-controller-row disabled={brzExiting || !emote}
        onClick={() => {
          if (BRZ_GARAGE_ENABLED && cockpitVehicle === "brz") useVehicleStudioStore.getState().setPart("hood", false);
          useCharacterPreviewStore.setState({ emote: null, playbackPaused: false, cockpitError: null, brzDoorReady: false });
        }}>Reset interaction</button>
    </div>
    : !insideCar && emoteGroup === "Pose pack" ? <CharacterPosePack disabled={reducedMotion} />
    : <CharacterEmoteList choice={previewChoice} group={emoteGroup === "Pose pack" || emoteGroup === "Creator" || emoteGroup === "Interactions" ? undefined : emoteGroup} search={emoteSearch} station={station} insideCar={insideCar}
    disabled={brzExiting || reducedMotion || cockpitPending} mirrorAvailable={mirrorAvailable} leanAvailable={leanAvailable} selectedId={emote?.id}
    favorites={favorites} onFavorite={toggleFavorite} onSearch={setEmoteSearch} onSelect={selectEmote} />);
  const emoteResultsPanel = <section className={locked ? "character-controls menu-panel-frame character-controls--right" : undefined}
    id={emoteResultsId} aria-label={emoteDetail ? "Emote details" : "Emote results"} hidden={!resultsOpen}>
    {emoteResults}
  </section>;
  const playback = tab === "emotes" && emoteBrowserOpen && <div className="character-playback" data-controller-row>
    <button type="button" className="menu-control" disabled={brzExiting || reducedMotion || (!emote && !selectedPreview.current)} onClick={() =>
      useCharacterPreviewStore.setState({ emote: selectedPreview.current && { ...selectedPreview.current }, playbackPaused: false })
    }>Play</button>
    <button type="button" className="menu-control" disabled={reducedMotion || !emote || insideCar || emoteGroup === "Interactions" || emoteGroup === "Pose pack"}
      aria-pressed={loopEmote}
      onClick={() => useCharacterPreviewStore.setState(state => ({ loopEmote: !state.loopEmote,
        emote: state.emote && { ...state.emote }, playbackPaused: false }))
    }>Loop</button>
    <button type="button" className="menu-control" disabled={brzExiting || !emote} onClick={() =>
      useCharacterPreviewStore.setState({ emote: null, loopEmote: false, automaticEmotes: false, playbackPaused: false, cockpitError: null })
    }>Stop</button>
  </div>;
  const fitting = tab === "appearance";
  const rotationDisabled = characterTurnLocked(insideCar, emote?.id);
  const vehiclePreview = tab === "emotes" && Boolean(cockpitVehicle);
  const cameraViews = tab === "body" ? BODY_CAMERAS : vehiclePreview ? CHARACTER_CAMERAS : CHARACTER_CAMERAS.filter(view => view !== "Whole car");
  const changeCamera = (view: typeof camera) => useCharacterPreviewStore.setState(s => ({ camera: view, zoom: 1, focusRevision: s.focusRevision + 1 }));
  const cameraSelect = insideCar
    ? <FittingCameraSelect views={COCKPIT_CAMERAS} driver view={camera === "Whole car" ? "Whole car" : "Full body"}
      viewLabels={{ "Full body": "Driver", "Whole car": "Whole vehicle" }} onViewChange={changeCamera} />
    : <FittingCameraSelect choice={previewChoice} views={cameraViews}
      view={!vehiclePreview && camera === "Whole car" ? "Full body" : camera} onViewChange={changeCamera} />;
  const togglePose = () => useCharacterPreviewStore.setState({ playbackPaused: !playbackPaused });
  const exitCockpit = insideCar && <PreviewToolButton label={exitLabel} disabled={exitDisabled} data-cockpit-toggle onClick={toggleCockpit}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M11 4H4v16h7m2-12 4 4-4 4m4-4H8" /></svg>
  </PreviewToolButton>;
  const poseTools = <FittingPoseTools>
    <PreviewToolButton label={playbackPaused ? "Resume pose" : "Hold pose"} aria-pressed={playbackPaused}
      onClick={togglePose}><PreviewToolIcon icon={playbackPaused ? "resume" : "hold"} /></PreviewToolButton>
    {fitting && <><PreviewToolButton label="Look away" disabled={reducedMotion}
      onClick={() => playEmote(LOOK_AWAY_EMOTE)}><PreviewToolIcon icon="lookAway" /></PreviewToolButton>
      {MAKEUP_EMOTES.map(item => <PreviewToolButton key={item.id} label={item.name}
        disabled={reducedMotion} onClick={() => playEmote(item)}><PreviewToolIcon icon={item.icon} /></PreviewToolButton>)}
    </>}
    {exitCockpit}
  </FittingPoseTools>;
  const angles = <div className="dressing-camera-block"><FittingAngleRail tools={poseTools}>{cameraSelect}</FittingAngleRail></div>;
  const framing = <FittingZoomRail insideCar={insideCar} />;
  const rotation = <FittingRotationControls characterDisabled={rotationDisabled} garageDisabled={insideCar} />;

  if (!locked) return (
    <div ref={page} className="character-page character-page--setup" aria-label="Choose character gender" onFocus={revealCharacterControl}>
      <div className="character-stage" ref={observeWorkshopViewport} data-character-viewport data-character-preview={character.id} data-outfit-preview={outfit.id} />
      <section className="character-controls menu-panel-frame">
        <header className="character-description"><h2>Choose gender</h2></header>
        {modelPicker}
        <div className="character-equip" data-controller-row>
          <ControllerAction button="A" className="menu-control" disabled={!editingAllowed || !connectedOwner || saved === undefined || status === "saving"}
            onClick={() => {
              if (!canEditCharacter()) return;
              queued.current.clear();
              queued.current.set(choice.id, choice);
              void flush();
            }}>
            {status === "saving" ? "Saving…" : `Confirm ${character.gender}`}
          </ControllerAction>
          {(!connectedOwner || saved === undefined) && <button type="button" className="menu-control" disabled={!editingAllowed} onClick={() => saveLocalCharacter(choice)}>
            Use locally
          </button>}
          {(!connectedOwner || saved === undefined) && <p role="status">{!connectedOwner ? "Connect your player profile to confirm." : "Update the game server to choose a character."}</p>}
        </div>
        {emoteBrowser}
        {emoteResultsPanel}
      </section>
      {angles}{framing}{rotation}
    </div>
  );

  return (
    <div ref={page} className={`character-page character-page--editor character-page--${fitting ? "dressing" : tab}${emoteGroup === "Creator" && tab === "emotes" ? " character-page--creator" : ""}`}
      role="tabpanel" id="character-editor-panel" aria-labelledby={"character-editor-tab-" + tab}
      onFocus={revealCharacterControl}>
      <div className="character-stage" ref={observeWorkshopViewport} data-character-viewport data-character-preview={previewChoice.id} data-outfit-preview={previewChoice.outfit}
        aria-label={`Preview of ${characterName ?? "Your character"}`} />
      {fitting && <DressingRoom navigation={wardrobeNavigation} choice={previewChoice} onChange={editPreviewAppearance} onPreviewOutfit={previewOutfit} onTryOn={tryOn} onLoad={loadOutfit}
        equipPreview={equipPreview} onDiscardPreview={activeTrial ? endOutfitPreview : undefined}
        onEndPreview={loadedOutfit ? endOutfitPreview : undefined} poseTools={poseTools}
        onColors={saveClothingColors} />}
      {tab === "body" && <WardrobeBody choice={previewChoice} onChange={editBodyAppearance}
        navigation={wardrobeNavigation} disabled={!editingAllowed} tattoosAvailable={!saveToProfile || bodyTattoosAvailable} />}
      {tab === "details" && <CharacterDetails name={characterName} gender={choice.identity ?? character.gender}
        personality={choice.appearance?.personality} bag={bag} selectedId={emote?.id} disabled={brzExiting || reducedMotion}
        onPreview={playEmote} />}
      {tab === "emotes" && <section className="character-controls menu-panel-frame character-controls--left" aria-label="Emote filters">
        {emoteBrowser}
      </section>}
      {tab === "emotes" && emoteResultsPanel}
      {(tab === "profile" || tab === "account") && <AlphaAccountPanel key={JSON.stringify([connectedOwner, tab])} tab={tab} />}
      {playback}
      {!fitting && angles}
      {framing}{rotation}
      {status === "error" && <section className="character-controls menu-panel-frame character-controls--bottom" aria-label="Recover unsaved changes">
        <div className="character-equip" data-controller-row>
            <button type="button" className="menu-control" onClick={() => saveToProfile ? void flush() : saveLocalCharacter(choice)}>Retry</button>
            <button type="button" className="menu-control" onClick={() => {
              if (!canEditCharacter()) return;
              queued.current.clear();
              clearFittingPreview();
              if (acknowledged.current) setChoice(acknowledged.current);
              setStatus("idle");
              notify("");
            }}>Revert unsaved</button>
        </div>
      </section>}
    </div>
  );
}
