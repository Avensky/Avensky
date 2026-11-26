import { useLayoutEffect, useRef, useState } from "react";
import { GameButton } from "../../components/GameButton";
import { ColorSwatch } from "../../components/menus/ColorSwatch";
import { CHARACTER_APPEARANCE_OPTIONS as options, characterAppearance, characterLook, installedHairStyles,
  type CharacterAppearance, type CharacterChoice } from "../characters/characterCatalog";
import { DEFAULT_HAIR_PALETTE, HAIR_COLOR_THEMES, HAIR_COLOR_ZONES, type HairColorZone } from "../characters/fittedWardrobe/hairColors";
import { CreatorOption } from "./CreatorOption";
import "./creatorColors.css";

type Step = "skin" | "hair" | "makeup";
type Channel = HairColorZone | "skin" | "style" | "presets" | "makeup" | "eyeshadow" | "eyeliner";
type Swatch = { id: string; label: string; color?: string };
type ThemeName = keyof typeof HAIR_COLOR_THEMES;
const labels: Record<Channel, string> = {
  skin: "Skin tone", base: "Base", roots: "Roots", highlights: "Highlights", tips: "Tips", style: "Style",
  presets: "Presets", makeup: "Lipstick", eyeshadow: "Eyeshadow", eyeliner: "Eyeliner",
};
const hairColors = [...options.hair_color,
  ...(["Honey Blonde", "Platinum Smoke", "Bright Copper", "Black Cherry", "Midnight Teal", "Icy Blue", "Violet Dusk", "Rose Quartz"] as const)
    .map(label => ({ id: label, label, color: HAIR_COLOR_THEMES[label].base }))];
const themeNames = Object.keys(HAIR_COLOR_THEMES) as ThemeName[];
const makeupChannels = ["makeup", "eyeshadow", "eyeliner"] as const;
const hairChannels = ["base", "roots", "highlights", "tips"] as const;
const shortHairChannels = ["base"] as const;
const linerStrokes: Record<string, string> = {
  classic: "M4 18 Q12 9 24 16",
  "cat-eye": "M4 18 Q12 9 23 15 L29 11 Q26 16 23 17",
  graphic: "M4 18 Q12 9 23 15 L29 10 M21 18 Q25 18 28 15",
};

export function CreatorColors({ step, choice, onChoice, busy, onContinue }: {
  step: Step; choice: CharacterChoice; onChoice: (next: CharacterChoice) => void; busy: boolean; onContinue: () => void;
}) {
  const [channel, setChannel] = useState<Channel>(step === "makeup" ? "makeup" : step === "hair" ? "base" : "skin");
  const group = useRef<HTMLDivElement>(null);
  const focusValue = useRef(false);
  const appearance = choice.appearance ?? characterAppearance(choice);
  const look = characterLook(choice);
  const natural = characterLook({ id: choice.id, outfit: choice.outfit });
  const styles = installedHairStyles(choice.id);
  const zoneChannels = appearance.hair === "cropped" ? shortHairChannels : hairChannels;
  const channels: readonly Channel[] = step === "makeup" ? makeupChannels : step === "skin" ? ["skin"] :
    [...zoneChannels, ...(zoneChannels.length > 1 ? ["presets" as const] : []), ...(styles.length || appearance.hair !== "natural" ? ["style" as const] : [])];
  const makeup = channel === "makeup" || channel === "eyeshadow" || channel === "eyeliner";
  const palette = appearance.hair_palette;
  const base = look?.hair ?? DEFAULT_HAIR_PALETTE.base;
  const currentPalette = palette ?? { ...DEFAULT_HAIR_PALETTE, base, roots: base, highlights: base, tips: base };
  const mix = channel === "highlights" ? "highlightStrength" : channel === "tips" ? "tipBlend" : undefined;
  const mixLabel = channel === "highlights" ? "Highlight strength" : "Tip blend";
  let values: Swatch[], active: string, change: (option: Swatch) => Partial<CharacterAppearance>;
  if (channel === "skin" || makeup) {
    values = channel === "makeup" ? options.makeup.filter(option => !option.legacy) : options[channel];
    active = appearance[channel] ?? (channel === "skin" ? "original" : "none");
    change = option => ({ [channel]: option.id });
  } else if (channel === "style") {
    values = [{ id: "natural", label: "Natural" }, ...styles];
    if (appearance.hair === "cropped") values.push({ id: "cropped", label: "Close crop" });
    active = appearance.hair;
    change = option => ({ hair: option.id });
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
      if (channel === "base" && stock && !palette) return { hair_color: option.id };
      return { hair_color: channel === "base" && stock ? option.id : appearance.hair_color, hair_palette: { ...currentPalette, [channel]: option.color! } };
    };
  }
  function pick(option: Swatch) {
    if (active !== option.id) onChoice({ ...choice, appearance: { ...appearance, ...change(option) } });
  }
  function openChannel(next: Channel, moveFocus = false) {
    if (moveFocus && channel === next) {
      focusSwatch();
      return;
    }
    focusValue.current = moveFocus;
    setChannel(next);
  }
  function focusSwatch() {
    const value = group.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? group.current?.querySelector<HTMLElement>("[data-creator-option]");
    value?.focus({ preventScroll: true });
  }
  useLayoutEffect(() => {
    if (focusValue.current) focusSwatch();
    focusValue.current = false;
  }, [channel]);
  function confirmValue() {
    const sequence: readonly Channel[] = step === "makeup" ? makeupChannels : step === "hair" ? zoneChannels : ["skin"];
    const index = sequence.indexOf(channel);
    if (index >= 0 && index + 1 < sequence.length) openChannel(sequence[index + 1], true);
    else onContinue();
  }
  return <>
    {channels.length > 1 && <div className="creator-color-channels" role="group" aria-label={step === "hair" ? "Hair channels" : "Makeup channels"}>
      {channels.map(id => <GameButton key={id} variant="custom" data-creator-channel={id} data-creator-option={"channel-" + id}
        className="creator-channel" aria-pressed={id === channel} disabled={busy} onPress={event => openChannel(id, event.type === "keydown" || event.type === "click")}>
        {labels[id]}
      </GameButton>)}
    </div>}
    <div ref={group} key={channel} className={"creator-options creator-color-options " + (channel === "style" || channel === "eyeliner" ? "creator-style-options" : "creator-swatches")}
      data-controller-row role="group" aria-label={labels[channel]}>
      {values.map(option => {
        const color = option.id === "original" ? (channel === "skin" ? natural?.skin : natural?.hair) : option.color;
        const preset = channel === "presets" ? HAIR_COLOR_THEMES[option.id as ThemeName] : undefined;
        return <CreatorOption key={option.id} id={option.id} label={option.label} selected={active === option.id}
          busy={busy} onFocusOption={() => pick(option)} onPick={() => pick(option)} onConfirm={confirmValue}>
          {preset ? <span className="creator-preset-stripes" aria-hidden="true">
            {HAIR_COLOR_ZONES.map(key => <i key={key} style={{ background: preset[key] }} />)}
          </span> : channel === "eyeliner" ? <>
            {linerStrokes[option.id] && <svg viewBox="0 0 32 24" aria-hidden="true"><path d={linerStrokes[option.id]} /></svg>}
            <span>{option.label}</span>
          </> : color ? <ColorSwatch color={color} /> : channel === "style" ? <span>{option.label}</span> : <span aria-hidden="true">∅</span>}
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
    <span className="creator-color-label">{values.find(option => option.id === active)?.label ??
      (channel === "presets" ? "Custom" : palette && HAIR_COLOR_ZONES.includes(channel as HairColorZone) ? palette[channel as HairColorZone] : "Original")}</span>
  </>;
}
