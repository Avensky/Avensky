import { useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from "react";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { useUIStore } from "../../store/menus/uiStore";
import { bakeCharacterPortrait, peekCharacterPortrait, subscribeCharacterPortrait } from "./bakeCharacterPortrait";
import { getWardrobeGarment, wardrobeGarmentModelUrl } from "./wardrobeGarments";
import { villagerModelUrl } from "./villagerModel";
import { characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import "./characters.css";

const PORTRAIT_QUIET_MS = 900;
const portraitActivity = ["pointerdown", "pointerup", "pointermove", "click", "wheel", "keydown", "avenlab:main-menu-action"] as const;

// Play, the fitting room and live scenes can display a finished portrait.
// Only a selected, idle profile view is allowed to prepare a new portrait
// outside the main menu; keep WebGL work off ordinary character turns.
function portraitMenuAllowsWork({ screen, overlay, isModeLoading }: ReturnType<typeof useUIStore.getState>) {
  return screen === "main" && overlay === null && !isModeLoading;
}

function schedulePortraitWork(work: () => () => void, inWelcome: boolean) {
  let timer: number | undefined, idle: number | undefined;
  let cancelWork: (() => void) | undefined;
  let quietUntil = performance.now() + PORTRAIT_QUIET_MS;
  const canRun = () => {
    const state = useUIStore.getState();
    return document.visibilityState !== "hidden" && (portraitMenuAllowsWork(state)
      || (inWelcome && (state.screen === "welcome" || state.screen === "heroes") && !state.isModeLoading));
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
    if (idle !== undefined) { cancel(); schedule(); }
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
  welcomePreview?: "candidate" | "selected";
};

export function CharacterPortrait({ choice, label, welcomePreview }: PortraitProps) {
  const look = useMemo(() => characterLook(choice), [choice]);
  const canBake = typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
  const url = canBake && look ? villagerModelUrl(look, "portrait") : null;
  const canRefresh = useUIStore(state => portraitMenuAllowsWork(state)
    || (welcomePreview === "selected" && (state.screen === "welcome" || state.screen === "heroes") && !state.isModeLoading));
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
    if (needsBake) return schedulePortraitWork(() => startBake(), welcomePreview === "selected");
  }, [needsBake, key, welcomePreview]);
  if (cached && failedKey !== key) {
    return <img className="character-portrait character-portrait--model" src={cached} alt={label ?? ""}
      decoding="async" onError={() => setFailedKey(key)} />;
  }
  return needsBake
    ? <span className="character-portrait character-portrait--loading" aria-hidden="true" />
    : null;
}

export function ProfilePortrait(props: PortraitProps) {
  return <span className="profile-portrait-frame" aria-hidden="true">
    <MenuIcon name="profile" />
    <CharacterPortrait {...props} />
  </span>;
}
