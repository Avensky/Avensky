import { GameButton } from "../../components/GameButton";
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

const controls = [
  { subject: "garage", direction: -1 },
  { subject: "character", direction: -1 },
  { subject: "character", direction: 1 },
  { subject: "garage", direction: 1 },
] as const;

export function FittingRotationControls({ characterDisabled, garageDisabled }: {
  characterDisabled: boolean; garageDisabled: boolean;
}) {
  return <div className="fitting-rotation-grid" role="group" aria-label="Rotate character and garage" data-controller-row>
    {controls.map(({ subject, direction }) => {
      const right = direction > 0;
      const garage = subject === "garage";
      const label = `Rotate ${subject} ${right ? "right" : "left"}`;
      return <GameButton key={label} variant="custom" pressFeedback className="fitting-rotation-button"
        data-rotation={subject} disabled={garage ? garageDisabled : characterDisabled}
        aria-label={label} title={label} onPress={() => (garage ? turnGarage : turnCharacter)(direction)}>
        <RotateArrow garage={garage} right={right} />
      </GameButton>;
    })}
  </div>;
}
