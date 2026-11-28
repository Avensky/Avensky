import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { GameButton } from "../../components/GameButton";
import { ColorSwatch } from "../../components/menus/ColorSwatch";
import { SecondaryTabRow } from "../../components/menus/SecondaryTabRow";
import type { MenuAction } from "../../controls/inputRouting";
import { useTextKeyboardStore } from "../../store/text/keyboardStore";
import { CHARACTER_APPEARANCE_OPTIONS as options, characterAppearance, characterLook,
  type CharacterAppearance, type CharacterChoice } from "../characters/characterCatalog";
import { appearanceHairPalette, DEFAULT_HAIR_PALETTE, HAIR_COLOR_THEMES, HAIR_COLOR_ZONES, type HairColorZone, type HairPalette } from "../characters/fittedWardrobe/hairColors";
import { BRAIDED_PONYTAIL_THEMES } from "../characters/fittedWardrobe/hairGroom";
import { CreatorOption } from "./CreatorOption";
import "./creatorColors.css";

import { creatorColorChannels, colorChannelLabels as labels, type ColorChannel, type ColorStep } from "./creatorColorChannels";

type Swatch = { id: string; label: string; color?: string };
const ponytailThemes = { ...BRAIDED_PONYTAIL_THEMES, ...HAIR_COLOR_THEMES };
const hairColors = [...options.hair_color,
  ...(["Honey Blonde", "Platinum Smoke", "Bright Copper", "Black Cherry", "Midnight Teal", "Icy Blue", "Violet Dusk", "Rose Quartz"] as const)
    .map(label => ({ id: label, label, color: HAIR_COLOR_THEMES[label].base }))];
const linerStrokes: Record<string, string> = {
  classic: "M4 18 Q12 9 24 16",
  "cat-eye": "M4 18 Q12 9 23 15 L29 11 Q26 16 23 17",
  graphic: "M4 18 Q12 9 23 15 L29 10 M21 18 Q25 18 28 15",
};

export function CreatorColors({ step, choice, onChoice, busy, onContinue, wardrobeField }: {
  step: ColorStep; choice: CharacterChoice; onChoice: (next: CharacterChoice, change: Partial<CharacterAppearance>) => void; busy: boolean; onContinue?: () => void;
  wardrobeField?: { channel: ColorChannel; renderSample: (option: Swatch, preset?: HairPalette) => ReactNode };
}) {
  const [requested, setChannel] = useState<ColorChannel>("base");
  const id = useId();
  const group = useRef<HTMLDivElement>(null);
  const movingToChannel = useRef(false);
  const appearance = choice.appearance ?? characterAppearance(choice);
  const themes: Record<string, HairPalette> = appearance.hair === "Mia_01" ? ponytailThemes : HAIR_COLOR_THEMES;
  const look = characterLook(choice);
  const natural = characterLook({ id: choice.id, outfit: choice.outfit });
  const channels = creatorColorChannels(step, appearance.hair);
  const requestedChannel = wardrobeField?.channel ?? requested;
  const channel = channels.includes(requestedChannel) ? requestedChannel : channels[0];
  const palette = appearanceHairPalette(appearance);
  const base = look?.hair ?? DEFAULT_HAIR_PALETTE.base;
  const currentPalette = palette ?? { ...DEFAULT_HAIR_PALETTE, base, roots: base, highlights: base, tips: base };
  const mix = channel === "highlights" ? "highlightStrength" : channel === "tips" ? "tipBlend" : undefined;
  const mixLabel = channel === "highlights" ? "Highlight strength" : "Tip blend";
  let values: Swatch[], active: string, change: (option: Swatch) => Partial<CharacterAppearance>;
  if (channel === "brow_color" || channel === "skin" || channel === "eye_color" || channel === "makeup" || channel === "eyeshadow" || channel === "eyeliner") {
    values = channel === "makeup" ? options.makeup.filter(option => !option.legacy) : options[channel];
    active = appearance[channel] ?? (channel === "brow_color" || channel === "skin" || channel === "eye_color" ? "original" : "none");
    change = option => ({ [channel]: option.id });
  } else if (channel === "presets") {
    const themeNames = Object.keys(themes);
    values = themeNames.map(name => ({ id: name, label: name, color: themes[name].base }));
    active = palette ? themeNames.find(name => {
      const theme = themes[name];
      return HAIR_COLOR_ZONES.every(key => theme[key] === palette[key]) && theme.highlightStrength === palette.highlightStrength && theme.tipBlend === palette.tipBlend;
    }) ?? "" : "";
    change = option => ({ hair_color: "original", hair_palette: { ...themes[option.id] } });
  } else {
    values = channel === "base" ? hairColors : hairColors.filter(s => s.id !== "original");
    active = palette ? values.find(option => option.id !== "original" && option.color === palette[channel])?.id ?? "" : channel === "base" ? appearance.hair_color : "";
    change = option => {
      if (channel === "base" && option.id === "original") return { hair_color: "original", hair_palette: undefined };
      const stock = options.hair_color.some(item => item.id === option.id);
      if (channel === "base" && stock && !appearance.hair_palette) return { hair_color: option.id };
      return { hair_color: channel === "base" && stock ? option.id : appearance.hair_color, hair_palette: { ...currentPalette, [channel]: option.color! } };
    };
  }
  function apply(patch: Partial<CharacterAppearance>) {
    onChoice({ ...choice, appearance: { ...appearance, ...patch } }, patch);
  }
  function pick(option: Swatch) {
    if (active !== option.id) apply(change(option));
  }
  function focusSwatch() {
    if (!group.current || group.current.closest("[inert]")) return;
    const value = group.current.querySelector<HTMLElement>('[aria-pressed="true"]:not([aria-disabled="true"])') ??
      group.current.querySelector<HTMLElement>('[data-creator-option]:not([aria-disabled="true"])');
    // A custom preset or partially dyed head may not match any swatch. Simply
    // entering its field must not apply a new dye when we restore focus.
    movingToChannel.current = true;
    value?.focus({ preventScroll: true });
    movingToChannel.current = false;
  }
  function openChannel(next: ColorChannel) {
    if (channel === next) { focusSwatch(); return; }
    setChannel(next);
  }
  useLayoutEffect(focusSwatch, [channel]);
  function moveChannel(direction: number) {
    if (busy || channels.length < 2 || group.current?.closest("[inert]") || useTextKeyboardStore.getState().session) return;
    openChannel(channels[(channels.indexOf(channel) + direction + channels.length) % channels.length]);
  }
  const cycle = useEffectEvent((event: Event) => {
    const action = (event as CustomEvent<MenuAction>).detail;
    if (action === "previous_option" || action === "next_option") moveChannel(action === "previous_option" ? -1 : 1);
  });
  const inWardrobe = Boolean(wardrobeField);
  useEffect(() => {
    if (inWardrobe) return;
    window.addEventListener("avenlab:panel-action", cycle);
    return () => window.removeEventListener("avenlab:panel-action", cycle);
  }, [inWardrobe]);
  const activeLabel = values.find(option => option.id === active)?.label ??
    (channel === "presets" ? "Custom" : palette && HAIR_COLOR_ZONES.includes(channel as HairColorZone) ? palette[channel as HairColorZone] : "Original");
  return <>
    {!inWardrobe && channels.length > 1 && <SecondaryTabRow className="creator-color-channels" aria-label={step === "hair" ? "Hair color channels" : "Makeup channels"}>
      {channels.map(key => <GameButton key={key} variant="custom" role="tab" data-creator-channel={key}
        id={id + key} aria-selected={key === channel} aria-controls={id + "-colors"} disabled={busy}
        onPress={() => openChannel(key)}>{labels[key]}</GameButton>)}
    </SecondaryTabRow>}
    <div id={id + "-colors"} role={!inWardrobe && channels.length > 1 ? "tabpanel" : "group"}
      aria-labelledby={!inWardrobe && channels.length > 1 ? id + channel : undefined} aria-label={inWardrobe || channels.length === 1 ? labels[channel] : undefined}
      className="creator-preview-field" data-color-field={channel}>
      <div ref={group} key={channel} className={"creator-options creator-color-options " + (channel === "eyeliner" ? "creator-style-options" : "creator-swatches")}
        data-controller-row data-controller-columns="auto" role="group" aria-label={labels[channel] + " options"}>
        {values.map(option => {
          const color = option.id === "original" ? (channel === "eye_color" ? natural?.iris : channel === "skin" ? natural?.skin : channel === "brow_color" ? look?.hair : natural?.hair) : option.color;
          const preset = channel === "presets" ? themes[option.id] : undefined;
          return <CreatorOption key={option.id} id={option.id} label={option.label} selected={active === option.id}
            hideTooltip={channel === "eyeliner"} busy={busy} onFocusOption={() => { if (onContinue && !movingToChannel.current) pick(option); }} onPick={() => pick(option)} onConfirm={onContinue}>
            {wardrobeField ? wardrobeField.renderSample({ ...option, color }, preset) : preset ? <span className="creator-preset-sample" aria-hidden="true" style={{
              "--roots": preset.roots, "--base": preset.base, "--highlights": preset.highlights, "--tips": preset.tips,
            } as CSSProperties} /> : channel === "eyeliner" ? (
              <svg viewBox="0 0 32 24" aria-hidden="true">
                <path className="creator-eye-outline" d="M2 15 Q13 1 28 14 Q16 23 2 15 Z" />
                {linerStrokes[option.id] && <path d={linerStrokes[option.id]} />}
              </svg>
            ) : color ? <ColorSwatch color={color} /> : <span aria-hidden="true">∅</span>}
          </CreatorOption>;
        })}
        {inWardrobe && HAIR_COLOR_ZONES.includes(channel as HairColorZone) &&
          <label className="creator-option wardrobe-custom-dye chamfered-frame" title="Custom color">
            <span aria-hidden="true">+</span><input type="color" disabled={busy} value={currentPalette[channel as HairColorZone]}
              aria-label={labels[channel] + " custom color"}
              onChange={event => apply({ hair_palette: { ...currentPalette, [channel]: event.target.value } })} />
          </label>}
      </div>
      {mix && <div className="creator-mix" data-controller-row role="group" aria-label={mixLabel}>
        <span>{mixLabel}</span>
        {([-1, 1] as const).map(direction => {
          const value = currentPalette[mix];
          const next = Math.max(0, Math.min(1, (Math.round(value * 100) + 10 * direction) / 100));
          return <div key={direction} className="creator-mix-direction">
            {direction === 1 && <output aria-live="polite">{Math.round(value * 100)}%</output>}
            <GameButton variant="custom" className="creator-mix-button chamfered-frame"
              aria-label={(direction < 0 ? "Decrease " : "Increase ") + mixLabel.toLowerCase()}
              data-creator-option={mix + "-" + direction} disabled={busy || next === value}
              onPress={() => apply({ hair_palette: { ...currentPalette, [mix]: next } })}>
              {direction < 0 ? "−" : "+"}
            </GameButton>
          </div>;
        })}
      </div>}
      <span className="creator-preview-caption">{activeLabel}</span>
    </div>
  </>;
}
