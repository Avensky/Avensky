import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { GameButton } from "../../components/GameButton";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { ColorSwatch } from "../../components/menus/ColorSwatch";
import "../welcome/characterCreator.css";
import { CreatorColors } from "../welcome/CreatorColors";
import { CreatorHairstyles } from "../welcome/CreatorHairstyles";
import { CreatorOption } from "../welcome/CreatorOption";
import { CHARACTER_APPEARANCE_OPTIONS as options, characterAppearance, characterLook, installedHairStyles,
  type CharacterAppearance, type CharacterChoice } from "./characterCatalog";
import { focusWardrobeFeature } from "./characterPreviewStore";
import type { WardrobeNavigation } from "./DressingRoom";
import { appearanceHairPalette, DEFAULT_HAIR_PALETTE } from "./fittedWardrobe/hairColors";
import { DEFAULT_HAIR_GROOM, HAIR_PIECES, type HairPiece } from "./fittedWardrobe/hairGroom";
import "./wardrobeBody.css";

const sections = {
  hairstyle: "Hairstyle", hair: "Hair color", eyes: "Eyes", makeup: "Makeup",
  skin: "Skin tone", brows: "Eyebrow tint", tattoo: "Tattoo",
};
type BodySection = keyof typeof sections;

export function WardrobeBody({ choice, onChange, disabled, tattoosAvailable, navigation }: {
  choice: CharacterChoice; onChange: (change: Partial<CharacterAppearance>) => void;
  disabled: boolean; tattoosAvailable: boolean; navigation?: Ref<WardrobeNavigation>;
}) {
  const [section, setSection] = useState<BodySection | null>(null);
  const [groomLayer, setGroomLayer] = useState<"sections" | HairPiece | null>(null);
  const piece = groomLayer && groomLayer !== "sections" ? groomLayer : null;
  const panel = useRef<HTMLElement>(null);
  const focusTarget = useRef<string>(null);
  const appearance = choice.appearance ?? characterAppearance(choice);
  const groom = appearance.hair_groom ?? DEFAULT_HAIR_GROOM;
  const look = characterLook(choice);
  const style = installedHairStyles(choice.id).find(item => item.id === appearance.hair);
  const makeup = [
    options.makeup.find(item => item.id === appearance.makeup && item.id !== "none")?.label,
    options.eyeshadow.find(item => item.id === appearance.eyeshadow && item.id !== "none")?.label,
    options.eyeliner.find(item => item.id === appearance.eyeliner && item.id !== "none")?.label,
  ].filter(Boolean).join(" · ");
  function back() {
    if (piece) {
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
  }, [section, groomLayer]);

  const selected = {
    hairstyle: style?.label ?? options.hair.find(style => style.id === appearance.hair)?.label ?? "Saved hairstyle",
    hair: appearance.hair_palette ? "Custom" : options.hair_color.find(color => color.id === appearance.hair_color)?.label,
    eyes: options.eye_color.find(color => color.id === (appearance.eye_color ?? "original"))?.label,
    brows: options.brow_color.find(color => color.id === (appearance.brow_color ?? "original"))?.label,
    skin: options.skin.find(color => color.id === appearance.skin)?.label,
    tattoo: options.tattoo.find(item => item.id === (appearance.tattoo ?? "none"))?.label,
    makeup: makeup || options.makeup.find(item => item.id === "none")?.label,
  };
  const colors = { hairstyle: undefined, hair: appearanceHairPalette(appearance)?.base ?? look?.hair,
    eyes: look?.iris, skin: look?.skin, brows: options.brow_color.find(item => item.id === appearance.brow_color)?.color ?? look?.hair,
    makeup: options.makeup.find(item => item.id === appearance.makeup)?.color, tattoo: undefined };
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
  const title = piece ? HAIR_PIECES.find(([id]) => id === piece)![1] : groomLayer ? "Hair sections" : section ? sections[section] : "Body";
  const colorChoice = piece ? { ...choice, appearance: { ...appearance,
    hair_palette: groom.pieces[piece] ?? appearanceHairPalette(appearance) ?? { ...DEFAULT_HAIR_PALETTE,
      base: look!.hair, roots: look!.hair, highlights: look!.hair, tips: look!.hair },
  } } : choice;
  return <section data-wardrobe-focus-group="content" ref={panel} className="character-controls menu-panel-frame character-body-style" aria-label="Body customization">
    <header className="wardrobe-body-heading">
      {section && <GameButton variant="custom" className="wardrobe-body-back" data-body-back data-controller-row
        aria-label={"Back to " + (piece ? "hair sections" : groomLayer ? "hair color" : "Body")} onPress={back}><MenuIcon name="back" /></GameButton>}
      <h2>{title}</h2>
      {section === "hair" && style?.editableGroom && groomLayer !== "sections" && (piece
        ? <GameButton variant="menu" data-controller-row disabled={disabled || !groom.pieces[piece]} onPress={clearPiece}>Use overall hair color</GameButton>
        : <GameButton variant="menu" data-controller-row data-body-groom onPress={() => {
          focusTarget.current = "[data-hair-piece]"; setGroomLayer("sections");
        }}>Hair sections</GameButton>)}
    </header>
    {!section ? <div className="wardrobe-body-grid" data-controller-row data-controller-columns="auto">
      {(Object.keys(sections) as BodySection[]).map(id => <GameButton key={id} variant="menu" className="wardrobe-body-category"
        data-body-section={id} disabled={disabled || (id === "tattoo" && !tattoosAvailable)}
        aria-label={sections[id]} onPress={() => {
          focusTarget.current = '[data-creator-option][aria-pressed="true"]';
          setSection(id);
        }}>
        <span>{sections[id]}</span>
        {colors[id] && <ColorSwatch color={colors[id]} />}
        <small>{id === "tattoo" && !tattoosAvailable ? "Server update required" : selected[id]}</small>
      </GameButton>)}
    </div> : groomLayer === "sections" ? <>
      <div className="wardrobe-body-grid" data-controller-row data-controller-columns="auto">
        {HAIR_PIECES.map(([id, label]) => <GameButton key={id} variant="menu" data-hair-piece={id} disabled={disabled}
          onPress={() => { focusTarget.current = '[data-creator-option][aria-pressed="true"]'; setGroomLayer(id); }}>{label}</GameButton>)}
        <GameButton variant="menu"
          disabled={disabled || (!appearance.hair_palette && appearance.hair_color === "original" && !Object.keys(groom.pieces).length)}
          onPress={() => onChange({ hair_color: "original", hair_palette: undefined,
            hair_groom: appearance.hair_groom && { ...groom, pieces: {} } })}>Reset hair colors</GameButton>
      </div>
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
    </> : <div className="creator-panel wardrobe-body-options" key={piece ?? section}>
      {section === "hairstyle" ? <CreatorHairstyles scope="catalog" choice={choice} onChoice={(_, change) => onChange(change)} busy={disabled} /> :
        section === "tattoo" ? <div className="creator-options wardrobe-body-grid" data-controller-row data-controller-columns="auto">
          {options.tattoo.map(option => <CreatorOption key={option.id} id={option.id} label={option.label}
            selected={option.id === (appearance.tattoo ?? "none")} busy={disabled || !tattoosAvailable}
            onPick={() => onChange({ tattoo: option.id })}>{option.label}</CreatorOption>)}
        </div> : <CreatorColors step={section} choice={colorChoice} onChoice={pickColor} busy={disabled} wardrobe />}
    </div>}
  </section>;
}
