import { ControllerButton } from "../../components/controller/ControllerButton";
import { useMenuInputDevice } from "../../components/controller/useMenuInputDevice";
import { GameButton } from "../../components/GameButton";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { useMobilePortrait } from "../../controls/useMobilePortrait";
import { savedCharacterAppearance, type CharacterSlot, type PlayerProfile } from "../../store/social/socialStore";
import { ProfilePortrait } from "../characters/CharacterPortrait";
import { styleName } from "../characters/characterStyles";
import { SELECTION_POSES, type SelectionPoseId } from "../characters/selectionPoses";

type Props = {
  profile: PlayerProfile;
  selected?: CharacterSlot;
  limit: number;
  pose: SelectionPoseId;
  busy: boolean;
  connected: boolean;
  onChoose: (slot: CharacterSlot) => void;
  onCreate: () => void;
  onEnter: () => void;
  onPose: (pose: SelectionPoseId) => void;
  onAccount?: () => void;
  onLogOut?: () => void;
  onBack?: () => void;
};

export function CharacterRoster({ profile, selected, limit, pose, busy, connected, onChoose,
  onCreate, onEnter, onPose, onAccount, onLogOut, onBack }: Props) {
  const portrait = useMobilePortrait();
  const device = useMenuInputDevice();
  const slots = profile.characters;
  const poseIndex = SELECTION_POSES.findIndex(item => item.id === pose);
  const poseName = SELECTION_POSES[poseIndex]?.name;
  const selectedAppearance = selected && savedCharacterAppearance(profile, selected);
  return <div className="character-roster" data-input-device={device} data-portrait={portrait || undefined}>
    <div className="roster-tools" data-controller-row data-controller-header-action>
      {onBack && <GameButton variant="menu" className="menu-panel-frame roster-tool" aria-label="Back"
        title="Back" disabled={busy} onPress={onBack}><MenuIcon name="back" /></GameButton>}
      {onLogOut && <GameButton variant="menu" className="menu-panel-frame roster-tool" aria-label="Log out"
        title="Log out" disabled={busy} onPress={onLogOut}><MenuIcon name="leave_game" /></GameButton>}
      {onAccount && <GameButton variant="menu" className="menu-panel-frame roster-tool" aria-label="Account"
        title="Account" disabled={busy} onPress={onAccount}><MenuIcon name="profile" /></GameButton>}
    </div>
    <div className="roster-choices">
      {slots ? <>
        <div className="roster-caption">
          <span className="roster-mobile-name">{selected?.name ?? "Characters"}</span>
          <small aria-label={`${slots.length} of ${limit} character slots used`}>{slots.length} / {limit}</small>
        </div>
        <div className="roster-tiles" role="group" aria-label="Saved characters" data-controller-row data-controller-columns={portrait ? limit : 1}
          onFocus={event => event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" })}>
          {slots.map(slot => <GameButton key={slot.id} variant="menu" className="welcome-character roster-tile menu-panel-frame"
            aria-label={slot.name} title={slot.name} data-character-id={slot.id} aria-pressed={slot.id === selected?.id}
            selected={slot.id === selected?.id} disabled={busy}
            onPointerUpCapture={event => { if (!busy && event.isPrimary && event.button === 0) event.currentTarget.focus({ preventScroll: true }); }}
            onFocusCapture={() => { if (!busy && slot.id !== selected?.id) onChoose(slot); }}
            onPress={() => onChoose(slot)}>
            <ProfilePortrait choice={savedCharacterAppearance(profile, slot)} label={slot.name} welcomePreview="roster" />
            <span className="welcome-character-details"><strong>{slot.name}</strong>
              <small>{styleName(slot.style)} · Level {slot.level}</small></span>
          </GameButton>)}
          {slots.length < limit && <GameButton variant="menu" className="roster-tile roster-create menu-panel-frame" aria-label="Create character"
            title="Create character" data-roster-create disabled={busy || !connected} onPress={onCreate}>
            <span className="roster-plus" aria-hidden="true"><MenuIcon name="add" /></span><span className="roster-create-label">Create character</span>
          </GameButton>}
        </div>
      </> : <p role="status" className="welcome-help">Character selection needs the updated game server.</p>}
    </div>
    {selectedAppearance && <div className="roster-preview-tools" data-controller-row>
      <span className="roster-rotate" aria-hidden="true">{device === "controller"
        ? <><ControllerButton button="LS" /> Look <ControllerButton button="RS" /> Rotate</> : "Drag to rotate"}</span>
      <GameButton variant="menu" className="menu-panel-frame roster-tool roster-pose" aria-label={`Pose: ${poseName}. Change pose`}
        title={`Pose: ${poseName}. Change pose`} onPress={() => onPose(SELECTION_POSES[(poseIndex + 1) % SELECTION_POSES.length].id)}>
        <MenuIcon name="accessibility" /></GameButton>
    </div>}
    <div className="roster-entry" data-controller-row>
      <GameButton variant="menu" className="menu-panel-frame roster-enter" aria-label="Enter world"
        disabled={!selectedAppearance || busy || !connected} onPress={onEnter}>
        {device === "controller" && <ControllerButton button="A" />} Enter world
      </GameButton>
    </div>
  </div>;
}
