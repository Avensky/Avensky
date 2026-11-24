import type { ComponentPropsWithRef, ReactNode } from "react";
import { ProgressBadge } from "../alpha/ProgressBadge";
import { canEditCharacter, useUIStore } from "../../store/menus/uiStore";
import { useSocialStore } from "../../store/social/socialStore";
import { characterLook, type CharacterChoice } from "./characterCatalog";
import { CharacterPortrait } from "./CharacterPortrait";
import { useSavedPlayerCharacter } from "./localOutfits";

type ProfileContent = { choice?: CharacterChoice | null; name: string; showProgress?: boolean };

function CharacterHeaderContent({ choice, name, showProgress }: ProfileContent) {
  return <>
    <span className="character-header-info">{showProgress ? <ProgressBadge compact /> : name}</span>
    <span className="character-header-portrait" aria-hidden="true"><CharacterPortrait choice={choice} /></span>
  </>;
}

export function CharacterHeaderButton({
  choice, name, showProgress, compact, joined, angled, ...button
}: ProfileContent & Omit<ComponentPropsWithRef<"button">, "type" | "name" | "children" | "className"> & {
  compact?: boolean;
  joined?: boolean;
  angled?: boolean;
}) {
  return <button {...button} type="button" className="character-header-profile" data-compact={compact || undefined}
    data-joined={joined || undefined} data-angled={angled || undefined}>
    <CharacterHeaderContent choice={choice} name={name} showProgress={showProgress} />
  </button>;
}

export type CharacterHeaderProfileProps = {
  onOpen?: () => void;
  leadingAction?: ReactNode;
  active?: boolean;
  showProgress?: boolean;
  readOnly?: boolean;
  compact?: boolean;
};

export function CharacterHeaderProfile({ onOpen, leadingAction, active, showProgress = false, readOnly = false, compact = false }: CharacterHeaderProfileProps) {
  const stagingSignIn = useSocialStore(state => state.stagingSignIn);
  const choice = useSavedPlayerCharacter(!stagingSignIn);
  const editingAllowed = useUIStore(canEditCharacter);
  const activeName = useSocialStore(state => {
    const profile = state.view?.profile;
    return profile?.characters?.find(slot => slot.id === profile.active_character_id)?.name;
  });
  const name = activeName ?? characterLook(choice)?.character.name ?? "Choose character";
  if (editingAllowed && onOpen && !readOnly) return (
    <div className="character-header-action" data-controller-row data-controller-header-action
      role={leadingAction ? "group" : undefined} aria-label={leadingAction ? "Customization" : undefined}>
      {leadingAction}
      <CharacterHeaderButton choice={choice} name={name} showProgress={showProgress} compact={compact} joined={Boolean(leadingAction)}
        data-open-character data-selection-action
        aria-label="Edit character" aria-current={active ? "page" : undefined} title={`Edit character · ${name}`}
        onClick={() => { if (canEditCharacter()) onOpen(); }} />
    </div>
  );
  return (
    <div className="character-header-profile" data-compact={compact || undefined} role="group" aria-label={name} title={name}>
      <CharacterHeaderContent choice={choice} name={name} showProgress={showProgress} />
    </div>
  );
}
