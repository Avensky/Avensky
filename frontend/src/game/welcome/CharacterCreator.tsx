import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { GameButton } from "../../components/GameButton";
import { ControlGlyph } from "../../components/controller/ControlGlyph";
import { AngledGameTab } from "../../components/menus/MenuTabButton";
import { MenuIcon, type MenuIconName } from "../../components/menus/MenuIcon";
import { openFieldKeyboard } from "../../components/text/openFieldKeyboard";
import { bindCreatorPanel, routeMenuAction, type MenuAction } from "../../controls/inputRouting";
import { useTextKeyboardStore } from "../../store/text/keyboardStore";
import { APP_BRANDING } from "../../theme/branding";
import { ProfilePortrait } from "../characters/CharacterPortrait";
import { CHARACTERS, type CharacterChoice } from "../characters/characterCatalog";
import { CHARACTER_STYLES, attitudeName, type CharacterBody } from "../characters/characterStyles";
import { CreatorColors } from "./CreatorColors";
import { CreatorHairstyles } from "./CreatorHairstyles";
import { nextCreatorControl } from "./creatorNavigation";
import { CreatorOption } from "./CreatorOption";
import "./characterCreator.css";

export const CREATOR_STEPS = ["gender", "looks", "skin", "hairstyle", "hair", "eyes", "makeup", "personality"] as const;
export type CreatorStep = typeof CREATOR_STEPS[number];
const labels: Record<CreatorStep, string> = {
  gender: "Gender", looks: "Looks", skin: "Skin tone", hairstyle: "Hairstyle", hair: "Hair color", eyes: "Eyes", makeup: "Makeup", personality: "Personality",
};
const personalityIcons: Record<string, MenuIconName> = {
  neutral: "profile", friendly: "social", racer: "missions", mechanic: "garage", stoic: "explore", scientist: "concepts",
  elegant: "appearance", shy: "profile", playful: "controller", tsundere: "heroes", explorer: "explore", performer: "audio",
};
const starterFaces = CHARACTERS.map(character => ({
  character,
  choice: { id: character.id, outfit: character.outfits[0].id } satisfies CharacterChoice,
}));

type Props = {
  step: CreatorStep; onStep: (step: CreatorStep) => void;
  choice: CharacterChoice; facePreview: CharacterChoice; onChoice: (choice: CharacterChoice) => void;
  onBody: (body: CharacterBody) => void;
  style: string; onStyle: (id: string) => void; onPreviewStyle: (id?: string) => void;
  name: string; onName: (value: string) => void;
  busy: boolean; canSubmit: boolean; submitLabel: string; onBack: () => void; onSubmit: () => void;
  original?: CharacterChoice;
};

export function CharacterCreator({ step, onStep, choice, facePreview, onChoice, onBody, style, onStyle, onPreviewStyle,
  name, onName, busy, canSubmit, submitLabel, onBack, onSubmit, original }: Props) {
  const index = CREATOR_STEPS.indexOf(step);
  const final = step === "personality";
  const panel = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const footerAction = useRef<HTMLDivElement>(null);
  const nameRow = useRef<HTMLSpanElement>(null);
  const [editingName, setEditingName] = useState(false);
  const scope = useId();
  const currentFace = starterFaces.find(({ character }) => character.id === choice.id) ?? starterFaces[0];
  const body = currentFace.character.gender as CharacterBody;
  const visibleFaces = starterFaces.filter(({ character }) => step === "gender" || character.gender === body);

  function go(next: CreatorStep) {
    if (busy || next === step) return;
    setEditingName(false);
    onStep(next);
  }
  function advance() {
    if (busy) return;
    if (!final) go(CREATOR_STEPS[index + 1]);
    else if (canSubmit) onSubmit();
  }

  function selectedOption() {
    return panel.current?.querySelector<HTMLElement>('.creator-color-options [aria-pressed="true"]') ??
      panel.current?.querySelector<HTMLElement>('[data-creator-option][aria-pressed="true"]') ??
      panel.current?.querySelector<HTMLElement>("[data-creator-option]") ?? null;
  }
  function beginName(controller: boolean) {
    const input = field.current;
    if (!input) return;
    if (controller) {
      openFieldKeyboard(input, onName, { cancel: nameRow.current, done: footerAction.current, preserveOnExit: true });
    } else {
      input.focus({ preventScroll: true });
    }
  }
  function finishNativeName(done: boolean) {
    const next = done && canSubmit ? footerAction.current : nameRow.current;
    next?.focus({ preventScroll: true });
  }

  function navigate(action: MenuAction) {
    if (busy || useTextKeyboardStore.getState().session || panel.current?.closest("[inert]")) return;
    const active = document.activeElement;
    if (field.current && active === field.current) {
      if (action === "activate") beginName(true);
      if (action === "back") finishNativeName(false);
      return;
    }
    if (action === "previous_tab" || action === "next_tab") {
      const offset = action === "previous_tab" ? -1 : 1;
      go(CREATOR_STEPS[(index + offset + CREATOR_STEPS.length) % CREATOR_STEPS.length]);
    } else if (action === "left" || action === "right" || action === "up" || action === "down") {
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('[data-creator-option]:not([aria-disabled="true"]), [data-creator-name-nav]') ?? []);
      const from = active instanceof HTMLElement && controls.includes(active) ? active : selectedOption();
      if (from) nextCreatorControl(controls, from, action)?.focus({ preventScroll: true });
    } else if (action === "activate") {
      if (nameRow.current && active === nameRow.current) beginName(true);
      else if (active instanceof HTMLElement && active.closest(".creator-controls")) active.click();
      else selectedOption()?.click();
    } else if (action === "back") onBack();
  }
  const onPanelAction = useEffectEvent((event: Event) => navigate((event as CustomEvent<MenuAction>).detail));
  useEffect(() => {
    window.addEventListener("avenlab:panel-action", onPanelAction);
    return () => {
      window.removeEventListener("avenlab:panel-action", onPanelAction);
      const keyboard = useTextKeyboardStore.getState();
      if (keyboard.session?.id === scope + "-name") keyboard.close();
    };
  }, [scope]);
  useLayoutEffect(() => {
    if (panel.current) return bindCreatorPanel(panel.current);
  }, []);
  useLayoutEffect(() => {
    if (!panel.current?.contains(document.activeElement)) selectedOption()?.focus({ preventScroll: true });
    tabs.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [step]);
  function keyboard(event: KeyboardEvent) {
    if (event.defaultPrevented || event.target === field.current || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const key = event.key.toLowerCase();
    const actions: Record<string, MenuAction> = {
      q: "previous_tab", e: "next_tab", "1": "previous_option", "3": "next_option",
      arrowleft: "left", a: "left", arrowright: "right", d: "right",
      arrowup: "up", w: "up", arrowdown: "down", s: "down", escape: "back",
    };
    const nameKey = nameRow.current && event.target === nameRow.current && (key === "enter" || key === " ");
    const action = actions[key];
    if (!action && !nameKey && !["pageup", "pagedown", "tab"].includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (nameKey) beginName(false);
    else if (action === "previous_option" || action === "next_option") routeMenuAction(action);
    else if (action) navigate(action);
  }

  return <div className="creator-controls" onKeyDown={keyboard}>
    <header className="garage-entry-header angled-tab-header creator-header">
      <GameButton variant="custom" className="garage-entry-brand creator-back"
        aria-label="Back to character selection" title="Back" disabled={busy} onPress={onBack}>
        <MenuIcon name="back" /><span>{APP_BRANDING.productName}</span>
      </GameButton>
      <div className="tabbed-angled-scroll creator-tab-scroll">
        <nav ref={tabs} className="angled-header-tabs" role="tablist" aria-label="Character creation steps">
          {CREATOR_STEPS.map(key => <AngledGameTab key={key} id={scope + key} aria-label={labels[key]}
            aria-controls={scope + "-panel"} selected={step === key} disabled={busy} onPress={() => go(key)}>
            {labels[key]}
          </AngledGameTab>)}
        </nav>
      </div>
    </header>
    <div ref={panel} id={scope + "-panel"} role="tabpanel" aria-labelledby={scope + step}
      className="creator-panel" data-creator-step={step}
      onPointerUpCapture={event => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const option = (event.target as Element).closest<HTMLElement>('[data-creator-option]:not([aria-disabled="true"])');
        // GameButton keeps taps from opening the mobile keyboard. Align focus
        // only on the chosen tile so the next D-pad move starts from that tap.
        option?.focus({ preventScroll: true });
      }}
      onFocusCapture={event => {
        if (event.target.matches("[data-creator-option],[data-creator-name-nav]")) event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }}>
      <h1>{labels[step]}</h1>
      {(step === "gender" || step === "looks") && <div key={step} className="creator-options creator-portraits" role="group"
        aria-label={labels[step]}>
        {visibleFaces.map(({ character, choice: face }, position) => {
          const gender = character.gender as CharacterBody;
          const selected = choice.id === face.id;
          const title = step === "gender" ? gender === "female" ? "Female" : "Male" : `Look ${position + 1}`;
          const pick = () => { if (!selected) onBody(gender); };
          return <CreatorOption key={face.id} id={step === "gender" ? gender : face.id} label={title}
            selected={selected} busy={busy} onFocusOption={pick} onPick={pick} onConfirm={advance}>
            <ProfilePortrait choice={step === "looks" ? facePreview : face} label={title} welcomePreview="roster" />
          </CreatorOption>;
        })}
      </div>}
      {step === "hairstyle" && <CreatorHairstyles choice={choice} facePreview={facePreview} onChoice={onChoice} busy={busy} onContinue={advance} />}
      {(step === "skin" || step === "hair" || step === "eyes" || step === "makeup") &&
        <CreatorColors key={step} step={step} choice={choice} onChoice={onChoice} busy={busy} onContinue={advance} />}
      {final && <>
        <div className="creator-options creator-personalities" role="group" aria-label="Personality"
          onMouseLeave={() => onPreviewStyle()} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onPreviewStyle(); }}>
          {CHARACTER_STYLES.map(item => {
            const label = attitudeName(item.attitude) ?? item.name;
            return <CreatorOption key={item.id} id={item.id} label={label} selected={style === item.id} busy={busy}
              hoverPreview onFocusOption={() => onPreviewStyle(item.id)} onPick={() => onStyle(item.id)} onConfirm={beginName}>
              <MenuIcon name={personalityIcons[item.attitude] ?? "profile"} /><span>{label}</span>
            </CreatorOption>;
          })}
          {original && <CreatorOption id="original" label="Keep current look" selected={style === "original"} busy={busy}
            hoverPreview onFocusOption={() => onPreviewStyle("original")} onPick={() => onStyle("original")} onConfirm={beginName}>
            <MenuIcon name="profile" /><span>Keep current look</span>
          </CreatorOption>}
        </div>
        <div className="creator-name">
          <label htmlFor={scope + "-name"}>Character name</label>
          <div className="creator-name-input-wrap">
            <span ref={nameRow} data-creator-name-nav className="creator-name-field chamfered-frame"
              role="group" aria-label="Character name" tabIndex={busy ? -1 : 0}>
              <input ref={field} id={scope + "-name"} name="characterName" value={name} autoComplete="nickname" autoCapitalize="words"
                minLength={2} maxLength={24} required disabled={busy} tabIndex={-1}
                onFocus={() => setEditingName(true)} onBlur={() => setEditingName(false)}
                onChange={event => onName(event.target.value)} onKeyDown={event => {
                  if (event.nativeEvent.isComposing || !["Escape", "Enter"].includes(event.key)) return;
                  event.preventDefault(); event.stopPropagation();
                  if (!event.repeat) finishNativeName(event.key === "Enter");
                }} />
            </span>
            {editingName && <GameButton variant="custom" className="creator-name-exit chamfered-frame"
              aria-label="Exit name editing" onPress={() => finishNativeName(false)}>
              <ControlGlyph controller="B" /><span>Exit</span>
            </GameButton>}
          </div>
        </div>
      </>}
    </div>
    <footer className="creator-footer">
      <GameButton ref={footerAction} variant="custom" className="creator-continue" data-creator-continue
        disabled={busy || (final && !canSubmit)} onPress={advance}>
        <ControlGlyph controller="A" /><span>{final ? submitLabel : "Continue"}</span>
      </GameButton>
    </footer>
  </div>;
}
