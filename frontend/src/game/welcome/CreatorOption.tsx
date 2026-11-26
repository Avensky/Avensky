import type { ReactNode, SyntheticEvent } from "react";
import { GameButton } from "../../components/GameButton";

type OptionProps = {
  id: string; label: string; selected: boolean; busy: boolean; children: ReactNode;
  hideTooltip?: boolean; onPick: () => void; onFocusOption?: () => void; hoverPreview?: boolean; onConfirm?: (fromController: boolean) => void;
};
export function CreatorOption({ id, label, selected, busy, children, hideTooltip, onPick, onFocusOption, hoverPreview, onConfirm }: OptionProps) {
  function activate(event: SyntheticEvent<HTMLDivElement>) {
    // Pointer users can compare a choice freely and then touch Continue. A/Enter
    // confirms the already focused choice without a second trip to the footer.
    const confirmFocus = event.type === "keydown" || event.type === "click";
    onPick();
    if (confirmFocus) onConfirm?.(event.type === "click");
  }
  return <GameButton variant="custom" data-creator-option={id} className="creator-option chamfered-frame"
    aria-label={label} aria-pressed={selected} selected={selected} disabled={busy} title={hideTooltip ? undefined : label}
    onFocusCapture={onFocusOption} onPress={activate}
    onPointerOverCapture={event => {
      if (hoverPreview && !busy && event.pointerType === "mouse") onFocusOption?.();
    }}>
    {children}
    {selected && <span className="creator-check" aria-hidden="true">✓</span>}
  </GameButton>;
}
