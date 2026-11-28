import { GameButton } from "../../components/GameButton";
import { PreviewToolIcon } from "../preview/PreviewToolIcon";
import { turnCharacter, turnGarage } from "./fittingControlsStore";
import "./fittingRotationControls.css";

function RotateArrow({ right, garage }: { right: boolean; garage: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <g transform={right ? "translate(24 0) scale(-1 1)" : undefined}>
      {garage
        ? <path d="M4.5 9a8 8 0 0 1 14.9-.3M4.5 4.5V9H9M19.5 15a8 8 0 0 1-14.9.3m14.9 4.2V15H15" />
        : <path d="M4.5 9a8 8 0 1 1-.2 5.5M4.5 4.5V9H9" />}
    </g>
  </svg>;
}

function RotationButton({ subject, direction, disabled }: {
  subject: "garage" | "character"; direction: -1 | 1; disabled: boolean;
}) {
  const right = direction > 0;
  const garage = subject === "garage";
  const label = `Rotate ${subject} ${right ? "right" : "left"}`;
  return <GameButton variant="custom" pressFeedback className="fitting-rotation-button"
    data-rotation={subject} disabled={disabled} aria-label={label} title={label}
    onPress={() => (garage ? turnGarage : turnCharacter)(direction)}>
    <RotateArrow garage={garage} right={right} />
  </GameButton>;
}

export function FittingRotationControls({ characterDisabled, garageDisabled, paused, reducedMotion, onTogglePose }: {
  characterDisabled: boolean; garageDisabled: boolean; paused: boolean; reducedMotion: boolean; onTogglePose: () => void;
}) {
  const label = reducedMotion ? "Pose playback paused by Reduced Motion" : paused ? "Resume pose" : "Pause pose";
  return <div data-wardrobe-focus-group="rotation" className="fitting-rotation-grid" role="group" aria-label="Rotation and pose playback" data-controller-row>
    <RotationButton subject="garage" direction={-1} disabled={garageDisabled} />
    <RotationButton subject="character" direction={-1} disabled={characterDisabled} />
    <GameButton variant="custom" pressFeedback className="fitting-rotation-button"
      aria-label={label} title={label} aria-pressed={paused || reducedMotion} disabled={reducedMotion} onPress={onTogglePose}>
      <PreviewToolIcon icon={paused || reducedMotion ? "resume" : "hold"} />
    </GameButton>
    <RotationButton subject="character" direction={1} disabled={characterDisabled} />
    <RotationButton subject="garage" direction={1} disabled={garageDisabled} />
  </div>;
}
