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
  onEnter: (slot: CharacterSlot) => void;
  onBack?: () => void;
};

export function CharacterRoster({ profile, selected, limit, busy, connected, onChoose,
  onCreate, onEnter, onBack }: Props) {
  const portrait = useMobilePortrait();
  const device = useMenuInputDevice();
  const slots = profile.characters;
  const selectedAppearance = selected && savedCharacterAppearance(profile, selected);
  return <div className="character-roster" data-input-device={device} data-portrait={portrait || undefined}>
    {onBack && <div className="roster-tools" data-controller-row data-controller-header-action>
      <GameButton variant="menu" className="menu-panel-frame roster-tool" aria-label="Back"
        title="Back" disabled={busy} onPress={onBack}><MenuIcon name="back" /></GameButton>
    </div>}
    <div className="roster-choices">
      {slots ? <>
        <div className="roster-caption">
          <span className="roster-mobile-name">{selected?.name ?? "Characters"}</span>
          <small aria-label={`${slots.length} of ${limit} character slots used`}>{slots.length} / {limit}</small>
        </div>
        <div className="roster-tiles" role="group" aria-label="Saved characters" data-controller-row data-controller-columns={portrait ? limit : 1}
          onFocus={event => event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" })}>
          {slots.map(slot => {
            const isSelected = slot.id === selected?.id;
            const canEnter = isSelected && connected && !busy && Boolean(selectedAppearance);
            return <GameButton key={slot.id} variant="menu" className="welcome-character roster-tile menu-panel-frame"
              aria-label={slot.name} aria-description={canEnter ? "Open the main menu as this character" : undefined}
              title={canEnter ? `Continue as ${slot.name}` : slot.name} data-character-id={slot.id}
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
              <ProfilePortrait choice={savedCharacterAppearance(profile, slot)} label={slot.name} welcomePreview="roster" />
              <span className="welcome-character-details"><strong>{slot.name}</strong>
                <small>{styleName(slot.style)} · Level {slot.level}</small></span>
              {canEnter && device === "controller" && <ControllerButton button="A" />}
            </GameButton>;
          })}
          {slots.length < limit && <GameButton variant="menu" className="roster-tile roster-create menu-panel-frame" aria-label="Create character"
            title="Create character" data-roster-create disabled={busy || !connected} onPress={onCreate}>
            <span className="roster-plus" aria-hidden="true"><MenuIcon name="add" /></span><span className="roster-create-label">Create character</span>
          </GameButton>}
        </div>
      </> : <p role="status" className="welcome-help">Character selection needs the updated game server.</p>}
    </div>
    {selectedAppearance && <div className="roster-preview-tools">
      <span className="roster-rotate" aria-hidden="true">{device === "controller"
        ? <><ControllerButton button="LS" /> Look <ControllerButton button="RS" /> Rotate</> : "Drag to rotate"}</span>
    </div>}
  </div>;
}
