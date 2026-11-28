import { useMemo, useRef } from "react";
import { ProfilePortrait } from "../characters/CharacterPortrait";
import {
  CHARACTERS, CHARACTER_APPEARANCE_OPTIONS, ROOK_ID, availableHairStyles, characterAppearance, type CharacterAppearance, type CharacterChoice,
} from "../characters/characterCatalog";
import femaleBraid from "../characters/previews/hairstyle-female.webp?no-inline";
import maleCut from "../characters/previews/hairstyle-male.webp?no-inline";
import { CreatorOption } from "./CreatorOption";
import "./creatorHairstyles.css";

export function CreatorHairstyles({ choice, onChoice, busy, onContinue, scope = "roster" }: {
  choice: CharacterChoice;
  onChoice: (next: CharacterChoice, change: Partial<CharacterAppearance>) => void; busy: boolean; onContinue?: () => void; scope?: "roster" | "catalog";
}) {
  const appearance = choice.appearance ?? characterAppearance(choice);
  const styles = useMemo(() => availableHairStyles(choice.id), [choice.id]);
  const portraits = useMemo(() => {
    const outfit = CHARACTERS.find(character => character.id === choice.id)?.outfits[0].id;
    return styles.map(style => outfit ? {
      id: choice.id, outfit, appearance: { ...characterAppearance(null), hair: style.id },
    } : undefined);
  }, [choice.id, styles]);

  const selectedStyle = styles.find(style => style.id === appearance.hair);
  const previewLabel = selectedStyle?.label ?? CHARACTER_APPEARANCE_OPTIONS.hair.find(style => style.id === appearance.hair)?.label ?? "Saved hairstyle";
  const firstFocus = useRef(true);
  return <div className="creator-preview-field">
    <div className="creator-options creator-hairstyles" role="group" aria-label="Hairstyles" data-controller-row data-controller-columns="auto">
      {styles.map((style, index) => {
        const selected = appearance.hair === style.id;
        const pick = () => {
          if (selected) return;
          const change = { hair: style.id, hair_groom: undefined };
          onChoice({ ...choice, appearance: { ...appearance, ...change } }, change);
        };
        return <CreatorOption key={style.id} id={style.id} label={style.label} selected={selected}
          hideTooltip busy={busy} onPick={pick} onFocusOption={() => {
            // If the saved cut is retired or unavailable, entering the tab
            // focuses its first replacement without changing the character.
            if (scope === "roster" && (!firstFocus.current || selectedStyle)) pick();
            firstFocus.current = false;
          }} onConfirm={onContinue}>
          {style.id === "natural"
            ? <span className="profile-portrait-frame" aria-hidden="true"><img className="character-portrait character-portrait--model"
                src={choice.id === ROOK_ID ? maleCut : femaleBraid} width={320} height={320} loading="lazy" decoding="async" alt="" /></span>
            : <ProfilePortrait choice={portraits[index]} welcomePreview={scope} hairstylePreview />}
        </CreatorOption>;
      })}
    </div>
    <span className="creator-preview-caption">{previewLabel}</span>
  </div>;
}
