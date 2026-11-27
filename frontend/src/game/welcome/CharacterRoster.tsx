import { Fragment } from "react";
import { formatCharacterName } from "../characters/characterName";
import { ControllerButton } from "../../components/controller/ControllerButton";
import { useMenuInputDevice } from "../../components/controller/useMenuInputDevice";
import { GameButton } from "../../components/GameButton";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { useMobilePortrait } from "../../controls/useMobilePortrait";
import { savedCharacterAppearance, type CharacterSlot, type PlayerProfile } from "../../store/social/socialStore";
import { ProfilePortrait } from "../characters/CharacterPortrait";
import { styleName } from "../characters/characterStyles";

type Props = {
  profile: PlayerProfile;
  selected?: CharacterSlot;
  limit: number;
  busy: boolean;
  connected: boolean;
  onChoose: (slot: CharacterSlot) => void;
  onCreate: () => void;
  onManage?: (slot: CharacterSlot) => void;
  onEnter: (slot: CharacterSlot) => void;
  onBack?: () => void;
};

export function CharacterRoster({ profile, selected, limit, busy, connected, onChoose,
  onCreate, onEnter, onBack, onManage }: Props) {
  const portrait = useMobilePortrait();
  const device = useMenuInputDevice();
  const slots = profile.characters;
  const selectedAppearance = selected && savedCharacterAppearance(profile, selected);
  const selectedName = selected && formatCharacterName(selected.name);
  const manage = selected && onManage && <GameButton variant="custom" className="roster-manage chamfered-frame"
    aria-label={`Manage ${selectedName}`} title={`Manage ${selectedName}`} aria-haspopup="dialog" data-roster-manage
    disabled={busy || !connected} onPress={() => onManage(selected)}>
    <MenuIcon name="other" /><span>Manage</span>
  </GameButton>;
  return <div className="character-roster" data-input-device={device} data-portrait={portrait || undefined}>
    {onBack && <div className="roster-tools" data-controller-row data-controller-header-action>
      <GameButton variant="custom" className="roster-tool chamfered-frame" aria-label="Back"
        title="Back" disabled={busy} onPress={onBack}><MenuIcon name="back" /></GameButton>
    </div>}
    <div className="roster-choices">
      {slots ? <>
        <div className="roster-caption" data-controller-row={portrait || undefined}>
          <span className="roster-mobile-name">{selectedName ?? "Characters"}</span>
          {portrait && manage}
          <small aria-label={`${slots.length} of ${limit} character slots used`}>{slots.length} / {limit}</small>
        </div>
        <div className="roster-tiles" role="group" aria-label="Saved characters" data-controller-row={portrait || undefined} data-controller-columns={portrait ? limit : undefined}
          onFocus={event => event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" })}>
          {slots.map(slot => {
            const name = formatCharacterName(slot.name);
            const isSelected = slot.id === selected?.id;
            const canEnter = isSelected && connected && !busy && Boolean(selectedAppearance);
            const tile = <GameButton variant="custom" className="welcome-character roster-tile chamfered-frame"
              aria-label={name} aria-description={canEnter ? "Go to the Garage as this character" : undefined}
              title={canEnter ? `Continue as ${name}` : name} data-character-id={slot.id}
              aria-pressed={isSelected} selected={isSelected} disabled={busy}
              onFocusCapture={() => { if (!busy && !isSelected) onChoose(slot); }}
              onPress={event => {
                if (canEnter) onEnter(slot);
                else if (!isSelected) {
                  // Moving focus previews the tile for touch, mouse and D-pad alike.
                  if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true });
                  else onChoose(slot);
                }
              }}>
              <ProfilePortrait choice={savedCharacterAppearance(profile, slot)} label={name} welcomePreview="roster" />
              <span className="welcome-character-details"><strong>{name}</strong>
                <small>{styleName(slot.style)} · Level {slot.level}</small></span>
              {canEnter && device === "controller" && <ControllerButton button="A" />}
            </GameButton>;
            return portrait ? <Fragment key={slot.id}>{tile}</Fragment> :
              <div key={slot.id} className="roster-tile-row" data-controller-row>
                {tile}{isSelected && manage}
              </div>;
          })}
          {slots.length < limit && <GameButton variant="custom" className="roster-tile roster-create chamfered-frame" aria-label="Create character"
            title="Create character" data-controller-row={!portrait || undefined} data-roster-create disabled={busy || !connected} onPress={onCreate}>
            <span className="roster-plus" aria-hidden="true"><MenuIcon name="add" /></span><span className="roster-create-label">Create character</span>
          </GameButton>}
        </div>
      </> : <p role="status" className="welcome-help">Character selection needs the updated game server.</p>}
    </div>
    {selectedAppearance && device === "controller" && <div className="roster-preview-tools">
      <span className="roster-rotate" aria-hidden="true">
        <ControllerButton button="LS" /> Look <ControllerButton button="RS" /> Rotate
      </span>
    </div>}
  </div>;
}
