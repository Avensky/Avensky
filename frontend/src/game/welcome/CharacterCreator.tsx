import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, type ReactNode, type SyntheticEvent } from "react";
import { GameButton } from "../../components/GameButton";
import { ControlGlyph } from "../../components/controller/ControlGlyph";
import { ColorSwatch } from "../../components/menus/ColorSwatch";
import { MenuIcon, type MenuIconName } from "../../components/menus/MenuIcon";
import type { MenuAction } from "../../controls/inputRouting";
import { APP_BRANDING } from "../../theme/branding";
import { ProfilePortrait } from "../characters/CharacterPortrait";
import {
  CHARACTER_APPEARANCE_OPTIONS, CHARACTERS, characterAppearance, characterLook, type CharacterChoice,
} from "../characters/characterCatalog";
import { CHARACTER_STYLES, attitudeName, creatorStarterHairLabel, type CharacterBody } from "../characters/characterStyles";
import "./characterCreator.css";

export const CREATOR_STEPS = ["gender", "looks", "skin", "hair", "makeup", "personality"] as const;
export type CreatorStep = typeof CREATOR_STEPS[number];
const labels: Record<CreatorStep, string> = {
  gender: "Gender", looks: "Looks", skin: "Skin tone", hair: "Hair color", makeup: "Makeup", personality: "Personality",
};
const personalityIcons: Record<string, MenuIconName> = {
  friendly: "social", racer: "missions", stoic: "explore", scientist: "concepts",
  elegant: "appearance", shy: "profile", playful: "controller", tsundere: "heroes",
};
const starterFaces = CHARACTERS.map(character => ({
  character,
  choice: { id: character.id, outfit: character.outfits[0].id } satisfies CharacterChoice,
}));

type Props = {
  step: CreatorStep; onStep: (step: CreatorStep) => void;
  choice: CharacterChoice; facePreview: CharacterChoice; onChoice: (choice: CharacterChoice) => void;
  onBody: (body: CharacterBody) => void;
  style: string; previewStyle?: string; onStyle: (id: string) => void; onPreviewStyle: (id?: string) => void;
  name: string; onName: (value: string) => void;
  busy: boolean; canSubmit: boolean; submitLabel: string; onBack: () => void; onSubmit: () => void;
  original?: CharacterChoice;
};

type OptionProps = {
  id: string; label: string; selected: boolean; busy: boolean; children: ReactNode;
  onPick: () => void; onFocusOption?: () => void; hoverPreview?: boolean; onConfirm?: () => void;
};
function CreatorOption({ id, label, selected, busy, children, onPick, onFocusOption, hoverPreview, onConfirm }: OptionProps) {
  function activate(event: SyntheticEvent<HTMLDivElement>) {
    // Pointer users can compare a choice freely and then touch Continue. A/Enter
    // confirms the already focused choice without a second trip to the footer.
    const confirmFocus = event.type === "keydown" || event.type === "click";
    onPick();
    if (confirmFocus) onConfirm?.();
  }
  return <GameButton variant="custom" data-creator-option={id} className="creator-option chamfered-frame"
    aria-label={label} aria-pressed={selected} selected={selected} disabled={busy} title={label}
    onFocusCapture={onFocusOption} onPress={activate}
    onPointerOverCapture={event => {
      if (hoverPreview && !busy && event.pointerType === "mouse") onFocusOption?.();
    }}>
    {children}
    {selected && <span className="creator-check" aria-hidden="true">✓</span>}
  </GameButton>;
}

export function CharacterCreator({ step, onStep, choice, facePreview, onChoice, onBody, style, previewStyle, onStyle, onPreviewStyle,
  name, onName, busy, canSubmit, submitLabel, onBack, onSubmit, original }: Props) {
  const index = CREATOR_STEPS.indexOf(step);
  const final = step === "personality";
  const panel = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLElement>(null);
  const scope = useId();
  const displayedStyle = previewStyle ?? style;
  const starter = CHARACTER_STYLES.find(item => item.id === displayedStyle);
  const currentFace = starterFaces.find(({ character }) => character.id === choice.id) ?? starterFaces[0];
  const body = currentFace.character.gender as CharacterBody;
  const appearance = choice.appearance ?? characterAppearance(choice);
  const field = step === "skin" ? "skin" : step === "hair" ? "hair_color" : "makeup";
  const palette = CHARACTER_APPEARANCE_OPTIONS[field];
  const activeColor = appearance[field] ?? "none";

  function go(next: CreatorStep) {
    if (busy || next === step) return;
    onStep(next);
  }
  function advance() {
    if (busy) return;
    if (!final) go(CREATOR_STEPS[index + 1]);
    else if (canSubmit) onSubmit();
  }
  const shoulder = useEffectEvent((event: Event) => {
    const action = (event as CustomEvent<MenuAction>).detail;
    if (action !== "previous_tab" && action !== "next_tab") return;
    const offset = action === "previous_tab" ? -1 : 1;
    go(CREATOR_STEPS[(index + offset + CREATOR_STEPS.length) % CREATOR_STEPS.length]);
  });
  useEffect(() => {
    window.addEventListener("avenlab:panel-action", shoulder);
    return () => window.removeEventListener("avenlab:panel-action", shoulder);
  }, []);
  useLayoutEffect(() => {
    const active = panel.current?.querySelector<HTMLElement>('[data-creator-option][aria-pressed="true"]') ??
      panel.current?.querySelector<HTMLElement>("[data-creator-option]");
    active?.focus({ preventScroll: true });
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    tabs.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [step]);

  function setColor(value: string) {
    if (value !== activeColor) onChoice({ ...choice, appearance: { ...appearance, [field]: value } });
  }
  const naturalLook = step === "skin" || step === "hair" ? characterLook(currentFace.choice) : undefined;
  return <>
    <header className="garage-entry-header angled-tab-header creator-header">
      <GameButton variant="custom" className="garage-entry-brand creator-back" data-controller-row data-controller-header-action
        aria-label="Back to character selection" title="Back" disabled={busy} onPress={onBack}>
        <MenuIcon name="back" /><span>{APP_BRANDING.productName}</span>
      </GameButton>
      <nav ref={tabs} className="creator-tabs" role="tablist" aria-label="Character creation steps" data-controller-row data-controller-header-action
        onFocusCapture={event => event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" })}>
        {CREATOR_STEPS.map(key => <GameButton key={key} id={scope + key} role="tab" variant="custom"
          aria-label={labels[key]} aria-controls={scope + "-panel"} aria-selected={key === step} disabled={busy}
          className="creator-tab" onPress={() => go(key)}>{labels[key]}</GameButton>)}
      </nav>
    </header>
    <div ref={panel} id={scope + "-panel"} role="tabpanel" aria-labelledby={scope + step}
      className="creator-panel" data-creator-step={step}
      onFocusCapture={event => {
        // The form navigator deliberately prevents page scrolling; reveal the
        // selected item inside its own swatch/character strip on small phones.
        if (event.target.closest(".creator-options")) event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }}>
      <h1>{labels[step]}</h1>
      {(step === "gender" || step === "looks") && <div key={step} className="creator-options creator-portraits" role="group"
        aria-label={labels[step]} data-controller-row>
        {starterFaces.filter(({ character }) => step === "gender" || character.gender === body).map(({ character, choice: face }) => {
          const gender = character.gender as CharacterBody;
          const selected = choice.id === face.id;
          const title = step === "gender" ? gender === "female" ? "Female" : "Male" : character.name;
          const pick = () => { if (!selected) onBody(gender); };
          return <CreatorOption key={face.id} id={step === "gender" ? gender : face.id} label={title}
            selected={selected} busy={busy} onFocusOption={pick} onPick={pick} onConfirm={advance}>
            <ProfilePortrait choice={step === "looks" ? facePreview : face} label={title} welcomePreview="roster" />
            <span className="creator-option-name">{title}</span>
          </CreatorOption>;
        })}
      </div>}
      {(step === "skin" || step === "hair" || step === "makeup") && <>
        <div key={step} className="creator-options creator-swatches" data-controller-row role="group" aria-label={labels[step]}>
          {palette.map(option => {
            const natural = field === "skin" ? naturalLook?.skin : naturalLook?.hair;
            const color = option.id === "original" && natural ? natural : option.color;
            const pick = () => setColor(option.id);
            return <CreatorOption key={option.id} id={option.id} label={option.label} selected={activeColor === option.id}
              busy={busy} onFocusOption={pick} onPick={pick} onConfirm={advance}>
              {!color ? <span className="creator-no-color" aria-hidden="true">∅</span>
                : <ColorSwatch color={color} />}
            </CreatorOption>;
          })}
        </div>
        <span className="creator-color-label">{palette.find(option => option.id === activeColor)?.label}</span>
      </>}
      {final && <>
        <div className="creator-options creator-personalities" role="group" aria-label="Personality" data-controller-row
          onMouseLeave={() => onPreviewStyle()} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onPreviewStyle(); }}>
          {CHARACTER_STYLES.map(item => {
            const label = attitudeName(item.attitude) ?? item.name;
            return <CreatorOption key={item.id} id={item.id} label={label} selected={style === item.id} busy={busy}
              hoverPreview onFocusOption={() => onPreviewStyle(item.id)} onPick={() => onStyle(item.id)}>
              <MenuIcon name={personalityIcons[item.attitude]} /><span>{label}</span>
            </CreatorOption>;
          })}
          {original && <CreatorOption id="original" label="Keep current look" selected={style === "original"} busy={busy}
            hoverPreview onFocusOption={() => onPreviewStyle("original")} onPick={() => onStyle("original")}>
            <MenuIcon name="profile" /><span>Keep current look</span>
          </CreatorOption>}
        </div>
        {starter && <dl className="creator-class-details" aria-label={attitudeName(starter.attitude) + " starter"}>
          <div><dt>Starter hair</dt><dd>{creatorStarterHairLabel(starter.id, body)}</dd></div>
          <div><dt>First wardrobe</dt><dd>{starter.name}</dd></div>
        </dl>}
        <label className="creator-name" data-controller-row>
          <span>Character name</span>
          <input name="characterName" value={name} autoComplete="nickname" autoCapitalize="words"
            minLength={2} maxLength={24} required disabled={busy} onChange={event => onName(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault(); event.stopPropagation(); if (canSubmit) onSubmit();
              }
            }} />
        </label>
      </>}
    </div>
    <footer className="creator-footer" data-controller-row>
      <GameButton variant="custom" className="creator-continue" data-creator-continue
        disabled={busy || (final && !canSubmit)} onPress={advance}>
        <ControlGlyph controller="A" /><span>{final ? submitLabel : "Continue"}</span>
      </GameButton>
    </footer>
  </>;
}
