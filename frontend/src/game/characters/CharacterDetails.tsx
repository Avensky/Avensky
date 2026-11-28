import { useMemo } from "react";
import { GameButton } from "../../components/GameButton";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { CHARACTER_IDENTITIES } from "./characterCatalog";
import { characterPersonality, type CharacterPersonality } from "./characterPersonality";
import { CHARACTER_STYLES } from "./characterStyles";
import { findGaragePreviewEmote } from "./garageEmotes";
import type { PreviewEmote } from "./CharacterEmoteList";

export function CharacterDetails({ name, gender, personality, bag, selectedId, disabled, onPreview }: {
  name?: string;
  gender: string;
  personality?: CharacterPersonality;
  bag: boolean;
  selectedId?: string;
  disabled: boolean;
  onPreview: (emote: PreviewEmote) => void;
}) {
  const traits = characterPersonality(personality);
  const style = CHARACTER_STYLES.find(item => item.attitude === traits.id);
  const emotes = useMemo(() => traits.emotes.flatMap(id => findGaragePreviewEmote(id, bag) ?? []), [traits, bag]);
  return <section data-wardrobe-focus-group="content" className="character-controls menu-panel-frame character-details" aria-label="Character details">
    <header className="character-description"><h2>{name ?? "Your character"}</h2></header>
    <dl className="character-traits">
      <dt>Gender</dt><dd>{CHARACTER_IDENTITIES.find(item => item.id === gender)?.label ?? gender}</dd>
      <dt>Personality</dt><dd>{traits.label}</dd>
      {style && <><dt>Starter wardrobe</dt><dd>{style.name}</dd></>}
    </dl>
    <h3>Signature emotes</h3>
    <div className="character-signature-emotes" role="group" aria-label="Signature emotes" data-controller-row data-controller-columns="2">
      {emotes.map(item => <GameButton key={item.id} variant="menu" className="chamfered-frame" pressFeedback
        aria-label={`Preview ${item.name}`} aria-current={selectedId === item.id || undefined} disabled={disabled}
        onPress={() => onPreview(item)}><MenuIcon name="play" /><span>{item.name}</span></GameButton>)}
    </div>
  </section>;
}
