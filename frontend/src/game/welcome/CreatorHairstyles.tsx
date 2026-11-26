import { useMemo, useRef } from "react";
import { ProfilePortrait } from "../characters/CharacterPortrait";
import {
  CHARACTER_APPEARANCE_OPTIONS, availableHairStyles, characterAppearance, type CharacterChoice,
} from "../characters/characterCatalog";
import { CreatorOption } from "./CreatorOption";
import "./creatorHairstyles.css";

export function CreatorHairstyles({ choice, facePreview = choice, onChoice, busy, onContinue }: {
  choice: CharacterChoice; facePreview?: CharacterChoice;
  onChoice: (next: CharacterChoice) => void; busy: boolean; onContinue: () => void;
}) {
  const appearance = choice.appearance ?? characterAppearance(choice);
  const styles = useMemo(() => availableHairStyles(choice.id), [choice.id]);
  const portraits = useMemo(() => styles.map(style => ({
    ...facePreview, appearance: { ...(facePreview.appearance ?? characterAppearance(facePreview)), hair: style.id },
  })), [facePreview, styles]);

  const selectedStyle = styles.find(style => style.id === appearance.hair);
  const previewLabel = selectedStyle?.label ?? CHARACTER_APPEARANCE_OPTIONS.hair.find(style => style.id === appearance.hair)?.label ?? "Saved hairstyle";
  const firstFocus = useRef(true);
  return <div className="creator-preview-field">
    <div className="creator-options creator-hairstyles" role="group" aria-label="Hairstyles">
      {styles.map((style, index) => {
        const selected = appearance.hair === style.id;
        const pick = () => {
          if (!selected) onChoice({ ...choice, appearance: { ...appearance, hair: style.id } });
        };
        return <CreatorOption key={style.id} id={style.id} label={style.label} selected={selected}
          hideTooltip busy={busy} onPick={pick} onFocusOption={() => {
            // If the saved cut is retired or unavailable, entering the tab
            // focuses its first replacement without changing the character.
            if (!firstFocus.current || selectedStyle) pick();
            firstFocus.current = false;
          }} onConfirm={onContinue}>
          <ProfilePortrait choice={portraits[index]} welcomePreview="roster" hairstylePreview />
        </CreatorOption>;
      })}
    </div>
    <span className="creator-preview-caption">{previewLabel}</span>
  </div>;
}
