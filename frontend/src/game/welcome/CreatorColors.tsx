import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { GameButton } from "../../components/GameButton";
import { ColorSwatch } from "../../components/menus/ColorSwatch";
import { SecondaryTabRow } from "../../components/menus/SecondaryTabRow";
import type { MenuAction } from "../../controls/inputRouting";
import { useTextKeyboardStore } from "../../store/text/keyboardStore";
import { CHARACTER_APPEARANCE_OPTIONS as options, characterAppearance, characterLook,
  type CharacterAppearance, type CharacterChoice } from "../characters/characterCatalog";
import { appearanceHairPalette, DEFAULT_HAIR_PALETTE, HAIR_COLOR_THEMES, HAIR_COLOR_ZONES, type HairColorZone } from "../characters/fittedWardrobe/hairColors";
import { CreatorOption } from "./CreatorOption";
import "./creatorColors.css";

type Step = "skin" | "hair" | "eyes" | "makeup";
type Channel = HairColorZone | "skin" | "eye_color" | "presets" | "makeup" | "eyeshadow" | "eyeliner";
type Swatch = { id: string; label: string; color?: string };
type ThemeName = keyof typeof HAIR_COLOR_THEMES;
const labels: Record<Channel, string> = {
  skin: "Skin tone", base: "Base", roots: "Roots", highlights: "Highlights", tips: "Tips", eye_color: "Eye color",
  presets: "Presets", makeup: "Lipstick", eyeshadow: "Eyeshadow", eyeliner: "Eyeliner",
};
const hairColors = [...options.hair_color,
  ...(["Honey Blonde", "Platinum Smoke", "Bright Copper", "Black Cherry", "Midnight Teal", "Icy Blue", "Violet Dusk", "Rose Quartz"] as const)
    .map(label => ({ id: label, label, color: HAIR_COLOR_THEMES[label].base }))];
const themeNames = Object.keys(HAIR_COLOR_THEMES) as ThemeName[];
const makeupChannels = ["makeup", "eyeshadow", "eyeliner"] as const;
const hairChannels = [...HAIR_COLOR_ZONES, "presets"] as const;
const singleChannels = { skin: ["skin"], eyes: ["eye_color"], cropped: ["base"] } as const;
const linerStrokes: Record<string, string> = {
  classic: "M4 18 Q12 9 24 16",
  "cat-eye": "M4 18 Q12 9 23 15 L29 11 Q26 16 23 17",
  graphic: "M4 18 Q12 9 23 15 L29 10 M21 18 Q25 18 28 15",
};

export function CreatorColors({ step, choice, onChoice, busy, onContinue }: {
  step: Step; choice: CharacterChoice; onChoice: (next: CharacterChoice) => void; busy: boolean; onContinue: () => void;
}) {
  const [requested, setChannel] = useState<Channel>("base");
  const id = useId();
  const group = useRef<HTMLDivElement>(null);
  const movingToChannel = useRef(false);
  const appearance = choice.appearance ?? characterAppearance(choice);
  const look = characterLook(choice);
  const natural = characterLook({ id: choice.id, outfit: choice.outfit });
  const channels: readonly Channel[] = step === "hair" ? (appearance.hair === "cropped" ? singleChannels.cropped : hairChannels)
    : step === "makeup" ? makeupChannels : singleChannels[step];
  const channel = channels.includes(requested) ? requested : channels[0];
  const palette = appearanceHairPalette(appearance);
  const base = look?.hair ?? DEFAULT_HAIR_PALETTE.base;
  const currentPalette = palette ?? { ...DEFAULT_HAIR_PALETTE, base, roots: base, highlights: base, tips: base };
  const mix = channel === "highlights" ? "highlightStrength" : channel === "tips" ? "tipBlend" : undefined;
  const mixLabel = channel === "highlights" ? "Highlight strength" : "Tip blend";
  let values: Swatch[], active: string, change: (option: Swatch) => Partial<CharacterAppearance>;
  if (channel === "skin" || channel === "eye_color" || channel === "makeup" || channel === "eyeshadow" || channel === "eyeliner") {
    values = channel === "makeup" ? options.makeup.filter(option => !option.legacy) : options[channel];
    active = appearance[channel] ?? (channel === "skin" || channel === "eye_color" ? "original" : "none");
    change = option => ({ [channel]: option.id });
  } else if (channel === "presets") {
    values = themeNames.map(name => ({ id: name, label: name, color: HAIR_COLOR_THEMES[name].base }));
    active = palette ? themeNames.find(name => {
      const theme = HAIR_COLOR_THEMES[name];
      return HAIR_COLOR_ZONES.every(key => theme[key] === palette[key]) && theme.highlightStrength === palette.highlightStrength && theme.tipBlend === palette.tipBlend;
    }) ?? "" : "";
    change = option => ({ hair_color: "original", hair_palette: { ...HAIR_COLOR_THEMES[option.id as ThemeName] } });
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
  function pick(option: Swatch) {
    if (active !== option.id) onChoice({ ...choice, appearance: { ...appearance, ...change(option) } });
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
  function openChannel(next: Channel) {
    if (channel === next) { focusSwatch(); return; }
    setChannel(next);
  }
  useLayoutEffect(() => {
    focusSwatch();
  }, [channel]);
  const cycle = useEffectEvent((event: Event) => {
    const action = (event as CustomEvent<MenuAction>).detail;
    if (action !== "previous_option" && action !== "next_option") return;
    if (busy || channels.length < 2 || group.current?.closest("[inert]") || useTextKeyboardStore.getState().session) return;
    const direction = action === "previous_option" ? -1 : 1;
    openChannel(channels[(channels.indexOf(channel) + direction + channels.length) % channels.length]);
  });
  useEffect(() => {
    window.addEventListener("avenlab:panel-action", cycle);
    return () => window.removeEventListener("avenlab:panel-action", cycle);
  }, []);
  const activeLabel = values.find(option => option.id === active)?.label ??
    (channel === "presets" ? "Custom" : palette && HAIR_COLOR_ZONES.includes(channel as HairColorZone) ? palette[channel as HairColorZone] : "Original");
  return <>
    {channels.length > 1 && <SecondaryTabRow className="creator-color-channels" aria-label={step === "hair" ? "Hair color channels" : "Makeup channels"}>
      {channels.map(key => <GameButton key={key} variant="custom" role="tab" data-creator-channel={key}
        id={id + key} aria-selected={key === channel} aria-controls={id + "-colors"} disabled={busy}
        onPress={() => openChannel(key)}>{labels[key]}</GameButton>)}
    </SecondaryTabRow>}
    <div id={id + "-colors"} role={channels.length > 1 ? "tabpanel" : "group"}
      aria-labelledby={channels.length > 1 ? id + channel : undefined} aria-label={channels.length === 1 ? labels[channel] : undefined}
      className="creator-preview-field" data-color-field={channel}>
      <div ref={group} key={channel} className={"creator-options creator-color-options " + (channel === "eyeliner" ? "creator-style-options" : "creator-swatches")}
        data-controller-row role="group" aria-label={labels[channel] + " options"}>
        {values.map(option => {
          const color = option.id === "original" ? (channel === "eye_color" ? natural?.iris : channel === "skin" ? natural?.skin : natural?.hair) : option.color;
          const preset = channel === "presets" ? HAIR_COLOR_THEMES[option.id as ThemeName] : undefined;
          return <CreatorOption key={option.id} id={option.id} label={option.label} selected={active === option.id}
            hideTooltip={channel === "eyeliner"} busy={busy} onFocusOption={() => { if (!movingToChannel.current) pick(option); }} onPick={() => pick(option)} onConfirm={onContinue}>
            {preset ? <span className="creator-preset-sample" aria-hidden="true" style={{
              "--roots": preset.roots, "--base": preset.base, "--highlights": preset.highlights, "--tips": preset.tips,
            } as CSSProperties} /> : channel === "eyeliner" ? (
              <svg viewBox="0 0 32 24" aria-hidden="true">
                <path className="creator-eye-outline" d="M2 15 Q13 1 28 14 Q16 23 2 15 Z" />
                {linerStrokes[option.id] && <path d={linerStrokes[option.id]} />}
              </svg>
            ) : color ? <ColorSwatch color={color} /> : <span aria-hidden="true">∅</span>}
          </CreatorOption>;
        })}
      </div>
      {mix && <div className="creator-mix" role="group" aria-label={mixLabel}>
        <span>{mixLabel}</span>
        {([-1, 1] as const).map(direction => {
          const value = currentPalette[mix];
          const next = Math.max(0, Math.min(1, (Math.round(value * 100) + 10 * direction) / 100));
          return <div key={direction} className="creator-mix-direction">
            {direction === 1 && <output aria-live="polite">{Math.round(value * 100)}%</output>}
            <GameButton variant="custom" className="creator-mix-button chamfered-frame"
              aria-label={(direction < 0 ? "Decrease " : "Increase ") + mixLabel.toLowerCase()}
              data-creator-option={mix + "-" + direction} disabled={busy || next === value}
              onPress={() => onChoice({ ...choice, appearance: { ...appearance, hair_palette: { ...currentPalette, [mix]: next } } })}>
              {direction < 0 ? "−" : "+"}
            </GameButton>
          </div>;
        })}
      </div>}
      <span className="creator-preview-caption">{activeLabel}</span>
    </div>
  </>;
}
