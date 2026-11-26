import { useMemo } from "react";
import { ProfilePortrait } from "../characters/CharacterPortrait";
import {
  availableHairStyles, characterAppearance, type CharacterChoice,
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

  return <div className="creator-options creator-hairstyles" role="group" aria-label="Hairstyles">
    {styles.map((style, index) => {
      const selected = appearance.hair === style.id;
      const pick = () => {
        if (!selected) onChoice({ ...choice, appearance: { ...appearance, hair: style.id } });
      };
      return <CreatorOption key={style.id} id={style.id} label={style.label} selected={selected}
        busy={busy} onPick={pick} onFocusOption={pick} onConfirm={onContinue}>
        <ProfilePortrait choice={portraits[index]} welcomePreview="roster" requireFittedHair={"mesh" in style} />
        <span className="creator-hairstyle-label">{style.label}</span>
      </CreatorOption>;
    })}
  </div>;
}
