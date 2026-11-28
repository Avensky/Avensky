import { useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentProps, type Ref } from "react";
import { GameButton } from "../../components/GameButton";
import { MenuIcon } from "../../components/menus/MenuIcon";
import "../welcome/characterCreator.css";
import { CreatorColors } from "../welcome/CreatorColors";
import { creatorColorChannels, colorChannelLabels, type ColorChannel } from "../welcome/creatorColorChannels";
import { CreatorHairstyles } from "../welcome/CreatorHairstyles";
import { CreatorOption } from "../welcome/CreatorOption";
import { BodyFeaturePreview } from "./BodyFeaturePreview";
import { CHARACTER_APPEARANCE_OPTIONS as options, characterAppearance, characterLook, installedHairStyles,
  type CharacterAppearance, type CharacterChoice } from "./characterCatalog";
import { focusWardrobeFeature } from "./characterPreviewStore";
import type { WardrobeNavigation } from "./DressingRoom";
import { appearanceHairPalette, DEFAULT_HAIR_PALETTE } from "./fittedWardrobe/hairColors";
import { DEFAULT_HAIR_GROOM, HAIR_PIECES, type HairPiece } from "./fittedWardrobe/hairGroom";
import "./wardrobeBody.css";

const sections = {
  hairstyle: "Hairstyle", hair: "Hair color", eyes: "Eyes", makeup: "Makeup",
  skin: "Skin tone", brows: "Eyebrow tint",
};
type Feature = keyof typeof sections;
type BodySection = Feature | "tattoo";
const selectedOption = '[data-creator-option][aria-pressed="true"]';

type AppliedValue = { label?: string; color?: string };
function BodyTile({ feature, channel, title, tint, option, applied, ...button }: {
  feature: Feature; channel?: string; title: string; tint?: string; option?: string;
  applied?: AppliedValue;
} & Omit<ComponentProps<typeof GameButton>, "children">) {
  return <GameButton {...button} variant="custom" className="wardrobe-body-category chamfered-frame" aria-label={title} aria-description={applied?.label}>
    <span className="wardrobe-body-picture"><BodyFeaturePreview feature={feature} channel={channel} tint={tint} option={option} /></span>
    <span className="wardrobe-body-tile-label">{title}{applied?.color && <i aria-hidden="true" style={{ backgroundColor: applied.color }} />}</span>
  </GameButton>;
}

export function WardrobeBody({ choice, onChange, disabled, tattoosAvailable, navigation }: {
  choice: CharacterChoice; onChange: (change: Partial<CharacterAppearance>) => void;
  disabled: boolean; tattoosAvailable: boolean; navigation?: Ref<WardrobeNavigation>;
}) {
  const [section, setSection] = useState<BodySection | null>(null);
  const [channel, setChannel] = useState<ColorChannel | null>(null);
  const [groomLayer, setGroomLayer] = useState<"sections" | HairPiece | null>(null);
  const piece = groomLayer && groomLayer !== "sections" ? groomLayer : null;
  const panel = useRef<HTMLElement>(null);
  const focusTarget = useRef<string>(null);
  const appearance = choice.appearance ?? characterAppearance(choice);
  const groom = appearance.hair_groom ?? DEFAULT_HAIR_GROOM;
  const look = characterLook(choice);
  const style = installedHairStyles(choice.id).find(item => item.id === appearance.hair);
  const colorStep = section && section !== "hairstyle" && section !== "tattoo" ? section : null;
  const channels = colorStep ? creatorColorChannels(colorStep, appearance.hair) : [];
  const field = channels.length === 1 ? channels[0] : channel;
  const chooseChannel = channels.length > 1 && !field;
  const sectionTitle = section === "tattoo" ? "Tattoo" : section ? sections[section] : "Body";
  const pieceTitle = piece && HAIR_PIECES.find(([id]) => id === piece)![1];
  const title = channel ? colorChannelLabels[channel] : pieceTitle || (groomLayer ? "Hair sections" : sectionTitle);
  const parentTitle = channel ? pieceTitle || sectionTitle : piece ? "Hair sections" : groomLayer ? "Hair color" : "Body";

  function openSection(id: BodySection) {
    focusTarget.current = id === "hair" || id === "makeup" ? "[data-creator-channel]" : selectedOption;
    setSection(id);
  }
  function back() {
    if (channel) {
      focusTarget.current = '[data-creator-channel="' + channel + '"]';
      setChannel(null);
    } else if (piece) {
      focusTarget.current = '[data-hair-piece="' + piece + '"]';
      setGroomLayer("sections");
    } else if (groomLayer) {
      focusTarget.current = "[data-body-groom]";
      setGroomLayer(null);
    } else if (section) {
      focusTarget.current = '[data-body-section="' + section + '"]';
      setSection(null);
    } else return false;
    return true;
  }

  useImperativeHandle(navigation, () => ({ back }));
  useLayoutEffect(() => { focusWardrobeFeature(section); }, [section]);
  useLayoutEffect(() => () => focusWardrobeFeature(null), []);
  useLayoutEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    const element = panel.current?.querySelector<HTMLElement>(target) ?? panel.current?.querySelector<HTMLElement>("[data-creator-option]");
    element?.focus({ preventScroll: true });
  }, [section, groomLayer, channel]);

  function clearPiece() {
    if (!piece) return;
    const pieces = { ...groom.pieces };
    delete pieces[piece];
    onChange({ hair_groom: { ...groom, pieces } });
  }
  function pickColor(next: CharacterChoice, change: Partial<CharacterAppearance>) {
    if (!piece) return onChange(change);
    if (change.hair_color === "original" && !change.hair_palette) return clearPiece();
    const dye = next.appearance?.hair_palette;
    if (!dye) return;
    onChange({ hair_groom: { ...groom, pieces: { ...groom.pieces, [piece]: dye } } });
  }
  const hairBase = look?.hair ?? DEFAULT_HAIR_PALETTE.base;
  const shownDye = (piece ? groom.pieces[piece] : undefined) ?? appearanceHairPalette(appearance);
  const applied: Record<Feature, AppliedValue> = {
    hairstyle: { label: style?.label ?? options.hair.find(item => item.id === appearance.hair)?.label },
    hair: { color: hairBase, label: appearance.hair_palette ? "Custom" : options.hair_color.find(item => item.id === appearance.hair_color)?.label },
    eyes: { color: look?.iris, label: options.eye_color.find(item => item.id === (appearance.eye_color ?? "original"))?.label },
    skin: { color: look?.skin, label: options.skin.find(item => item.id === appearance.skin)?.label },
    brows: { color: look?.brow ?? hairBase, label: options.brow_color.find(item => item.id === (appearance.brow_color ?? "original"))?.label },
    makeup: { label: (["makeup", "eyeshadow", "eyeliner"] as const).flatMap(key =>
      options[key].filter(item => item.id !== "none" && item.id === appearance[key]).map(item => item.label)).join(", ") || "No makeup" },
  };
  const channelTint: Partial<Record<ColorChannel, string>> = {
    base: shownDye?.base ?? hairBase, roots: shownDye?.roots ?? hairBase, highlights: shownDye?.highlights ?? hairBase,
    tips: shownDye?.tips ?? hairBase, makeup: look?.lipstick, eyeshadow: look?.eyeshadow,
  };
  const colorChoice = piece ? { ...choice, appearance: { ...appearance,
    hair_palette: shownDye ?? { ...DEFAULT_HAIR_PALETTE,
      base: hairBase, roots: hairBase, highlights: hairBase, tips: hairBase },
  } } : choice;
  return <section data-wardrobe-focus-group="content" ref={panel} className="character-controls menu-panel-frame character-body-style" aria-label="Body customization">
    <header className="wardrobe-body-heading">
      {section && <GameButton variant="custom" className="wardrobe-body-back" data-body-back data-controller-row
        aria-label={"Back to " + parentTitle} onPress={back}><MenuIcon name="back" /></GameButton>}
      <h2>{title}</h2>
    </header>
    {!section ? <div className="wardrobe-body-list">
      <div className="wardrobe-body-grid" data-controller-row data-controller-columns="auto" role="group" aria-label="Body features">
        {(Object.keys(sections) as Feature[]).map(id => <BodyTile key={id} feature={id} title={sections[id]} applied={applied[id]}
          data-body-section={id} disabled={disabled} onPress={() => openSection(id)} />)}
      </div>
      <GameButton variant="menu" className="wardrobe-body-extra" data-body-section="tattoo" data-controller-row
        disabled={disabled || !tattoosAvailable} onPress={() => openSection("tattoo")}>
        Tattoo{!tattoosAvailable && <small>Server update required</small>}
      </GameButton>
    </div> : groomLayer === "sections" ? <div className="wardrobe-body-list">
      <div className="wardrobe-body-grid" data-controller-row data-controller-columns="auto" role="group" aria-label="Hair sections">
        {HAIR_PIECES.map(([id, label]) => <GameButton key={id} variant="menu" data-hair-piece={id}
          disabled={disabled} onPress={() => {
            focusTarget.current = "[data-creator-channel]"; setGroomLayer(id);
          }}>{label}</GameButton>)}
      </div>
      <GameButton variant="menu" data-controller-row
        disabled={disabled || (!appearance.hair_palette && appearance.hair_color === "original" && !Object.keys(groom.pieces).length)}
        onPress={() => onChange({ hair_color: "original", hair_palette: undefined,
          hair_groom: appearance.hair_groom && { ...groom, pieces: {} } })}>Reset hair colors</GameButton>
      {(["volume", "thickness"] as const).map(key => <div key={key} className="wardrobe-groom-amount" data-controller-row>
        <span>{key === "volume" ? "Crown volume" : "Crown strand width"}</span>
        {([-1, 1] as const).map(direction => {
          const next = Math.max(key === "volume" ? 0 : -1, Math.min(1, Math.round((groom[key] + direction * .05) * 100) / 100));
          return <div key={direction}>{direction === 1 && <output>{Math.round(groom[key] * 100)}%</output>}
            <GameButton variant="menu" aria-label={(direction === 1 ? "Increase " : "Decrease ") + (key === "volume" ? "crown volume" : "crown strand width")}
              disabled={disabled || next === groom[key]} onPress={() => onChange({ hair_groom: { ...groom, [key]: next } })}>
              {direction === 1 ? "+" : "−"}
            </GameButton></div>;
        })}
      </div>)}
    </div> : chooseChannel && colorStep ? <div className="wardrobe-body-list">
      <div className="wardrobe-body-grid" data-controller-row data-controller-columns="auto" role="group" aria-label={title + " channels"}>
        {channels.map(key => <BodyTile key={key} feature={colorStep} channel={key} title={colorChannelLabels[key]}
          tint={channelTint[key]} option={key === "eyeliner" ? appearance.eyeliner : undefined}
          data-creator-channel={key} disabled={disabled} onPress={() => {
            focusTarget.current = selectedOption; setChannel(key);
          }} />)}
      </div>
      {section === "hair" && style?.editableGroom && (piece
        ? <GameButton variant="menu" data-controller-row disabled={disabled || !groom.pieces[piece]} onPress={clearPiece}>Use overall hair color</GameButton>
        : <GameButton variant="menu" data-controller-row data-body-groom disabled={disabled} onPress={() => {
          focusTarget.current = "[data-hair-piece]"; setGroomLayer("sections");
        }}>Hair sections</GameButton>)}
    </div> : <div className="creator-panel wardrobe-body-options" key={piece ?? section}>
      {section === "hairstyle" && <CreatorHairstyles scope="catalog" choice={choice} onChoice={(_, change) => onChange(change)} busy={disabled} />}
      {section === "tattoo" && <div className="creator-options wardrobe-body-grid" data-controller-row data-controller-columns="auto">
        {options.tattoo.map(option => <CreatorOption key={option.id} id={option.id} label={option.label}
          selected={option.id === (appearance.tattoo ?? "none")} busy={disabled || !tattoosAvailable}
          onPick={() => onChange({ tattoo: option.id })}>{option.label}</CreatorOption>)}
      </div>}
      {colorStep && field && <CreatorColors step={colorStep} choice={colorChoice} onChoice={pickColor} busy={disabled}
        wardrobeField={{ channel: field, renderSample: (option, preset) => <>
          <BodyFeaturePreview feature={colorStep} channel={field} option={option.id} tint={option.color} palette={preset} />
          {option.color && <span className="wardrobe-color-chip" aria-hidden="true" style={{
            background: preset ? `linear-gradient(90deg,${preset.roots} 25%,${preset.base} 25% 50%,${preset.highlights} 50% 75%,${preset.tips} 75%)` : option.color,
          }} />}
        </> }} />}
    </div>}
  </section>;
}
