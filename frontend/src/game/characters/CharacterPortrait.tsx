import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { useUIStore } from "../../store/menus/uiStore";
import { bakeCharacterPortrait, peekCharacterPortrait, subscribeCharacterPortrait } from "./bakeCharacterPortrait";
import { getWardrobeGarment, wardrobeGarmentModelUrl } from "./wardrobeGarments";
import { villagerModelUrl } from "./villagerModel";
import { characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import "./characters.css";

const PORTRAIT_QUIET_MS = 900;
const portraitActivity = ["pointerdown", "pointerup", "pointermove", "click", "wheel", "keydown", "avenlab:main-menu-action", "avenlab:panel-action"] as const;
type WelcomePreview = "candidate" | "selected" | "roster";

const rosterVisibility = new Map<Element, (visible: boolean) => void>();
let rosterObserver: IntersectionObserver | undefined;
function observeRosterTile(tile: Element, update: (visible: boolean) => void) {
  rosterObserver ??= new IntersectionObserver(entries => {
    for (const entry of entries) rosterVisibility.get(entry.target)?.(entry.isIntersecting);
  });
  rosterVisibility.set(tile, update);
  rosterObserver.observe(tile);
  return () => {
    rosterObserver?.unobserve(tile);
    rosterVisibility.delete(tile);
    if (!rosterVisibility.size) {
      rosterObserver?.disconnect();
      rosterObserver = undefined;
    }
  };
}

// Play, the fitting room and live scenes can display a finished portrait.
// A cold roster prepares static images only while the selection menu is idle.
function portraitMenuAllowsWork({ screen, overlay, isModeLoading }: ReturnType<typeof useUIStore.getState>, preview?: WelcomePreview) {
  if (isModeLoading) return false;
  if (screen === "main") return overlay === null;
  if (screen === "welcome") return preview === "roster" || preview === "selected";
  return screen === "heroes" && preview === "selected";
}

function schedulePortraitWork(work: () => () => void, preview?: WelcomePreview) {
  let timer: number | undefined, idle: number | undefined;
  let cancelWork: (() => void) | undefined;
  let quietUntil = performance.now() + PORTRAIT_QUIET_MS;
  const canRun = () => {
    const state = useUIStore.getState();
    return document.visibilityState !== "hidden" && portraitMenuAllowsWork(state, preview);
  };
  const cancel = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    timer = idle = undefined;
  };
  const stop = () => {
    cancel();
    cancelWork?.();
    for (const event of portraitActivity) window.removeEventListener(event, activity, true);
    document.removeEventListener("visibilitychange", visibility);
  };
  const start = () => {
    idle = undefined;
    if (!canRun()) return;
    if (performance.now() < quietUntil) { schedule(); return; }
    cancelWork = work();
  };
  const schedule = () => {
    if (!canRun()) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!canRun()) return;
      if (performance.now() < quietUntil) { schedule(); return; }
      if (window.requestIdleCallback) idle = window.requestIdleCallback(start);
      else start();
    }, Math.max(0, quietUntil - performance.now()));
  };
  function activity(event: Event) {
    if (event.type === "pointermove" && !(event as PointerEvent).buttons) return;
    quietUntil = performance.now() + PORTRAIT_QUIET_MS;
    if (preview === "roster" && cancelWork) {
      cancelWork();
      cancelWork = undefined;
      schedule();
    } else if (idle !== undefined) { cancel(); schedule(); }
  }
  function visibility() {
    cancel();
    cancelWork?.();
    cancelWork = undefined;
    quietUntil = performance.now() + PORTRAIT_QUIET_MS;
    schedule();
  }
  for (const event of portraitActivity) window.addEventListener(event, activity, { capture: true, passive: true });
  document.addEventListener("visibilitychange", visibility);
  schedule();
  return stop;
}

function portraitKey(look: CharacterLook, url: string, outfitUrl?: string) {
  const { hair, hair_color, skin, headwear, color, eye_color, brow_color, glasses, accent, tattoo, item_colors } = look.appearance;
  const colors = Object.entries(item_colors ?? {}).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => [key, Object.entries(values).sort(([a], [b]) => a.localeCompare(b))]);
  const { wardrobe } = look;
  return JSON.stringify([look.character.id, look.outfit.id, url, outfitUrl ?? null, hair, hair_color, skin, headwear,
    color, eye_color, brow_color, glasses, accent, tattoo, colors, wardrobe && [wardrobe.set, wardrobe.shirt, wardrobe.waist]]);
}

/** Render the saved look from its authored model while the menus are idle. */
type PortraitProps = {
  choice: CharacterChoice | null | undefined;
  label?: string;
  welcomePreview?: WelcomePreview;
};

export function CharacterPortrait({ choice, label, welcomePreview, cacheOnly }: PortraitProps & { cacheOnly?: boolean }) {
  const look = useMemo(() => characterLook(choice), [choice]);
  const canBake = typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
  const url = canBake && look ? villagerModelUrl(look, "portrait") : null;
  const canRefresh = useUIStore(state => !cacheOnly && portraitMenuAllowsWork(state, welcomePreview));
  const dress = look?.garments?.dress ? getWardrobeGarment(look.garments.dress) : undefined;
  const dressUrl = dress?.outfit ? wardrobeGarmentModelUrl(dress, "portrait") : undefined;
  const key = look && url ? portraitKey(look, url, dressUrl) : "";
  const cached = useSyncExternalStore(subscribeCharacterPortrait, () => key ? peekCharacterPortrait(key) : null, () => null);
  const [failedKey, setFailedKey] = useState<string>();
  const needsBake = canRefresh && Boolean(key) && !cached && failedKey !== key;
  const startBake = useEffectEvent(() => {
    const job = new AbortController();
    if (look && url) void bakeCharacterPortrait(key, {
      look, modelUrl: url, dress: dress && dressUrl ? { item: dress, url: dressUrl } : undefined,
    }, job.signal).catch(() => { if (!job.signal.aborted) setFailedKey(key); });
    return () => job.abort();
  });
  useEffect(() => {
    if (needsBake) return schedulePortraitWork(() => startBake(), welcomePreview);
  }, [needsBake, key, welcomePreview]);
  if (cached && failedKey !== key) {
    return <img className="character-portrait character-portrait--model" src={cached} alt={label ?? ""}
      decoding="async" onError={() => setFailedKey(key)} />;
  }
  return needsBake && welcomePreview !== "roster"
    ? <span className="character-portrait character-portrait--loading" aria-hidden="true" />
    : null;
}

export function ProfilePortrait(props: PortraitProps) {
  const frame = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const watch = props.welcomePreview === "roster" && typeof IntersectionObserver !== "undefined";
  useEffect(() => {
    if (watch && frame.current) return observeRosterTile(frame.current, setVisible);
  }, [watch]);
  return <span className="profile-portrait-frame" aria-hidden="true" ref={frame}>
    <MenuIcon name="profile" />
    <CharacterPortrait {...props} cacheOnly={watch && !visible} />
  </span>;
}
