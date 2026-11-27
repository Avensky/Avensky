import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { GameButton } from "../GameButton";

function AngledTabEdge({ separatorBefore }: { separatorBefore?: boolean }) {
  return <svg className="angled-header-edge" data-separator={separatorBefore || undefined} viewBox="0 0 18 72" preserveAspectRatio="none" aria-hidden="true">
    <path d="M18 0 0 72" />
  </svg>;
}

/** Touch-first control with the same edge, active underline and palette as other angled scene tabs. */
export function AngledGameTab({ children, selected, ...props }: ComponentPropsWithoutRef<typeof GameButton>) {
  return <GameButton {...props} variant="custom" role="tab" className="angled-header-tab angled-game-tab" selected={selected} aria-selected={selected}>
    <span className="scene-header-tab-label">{children}</span><AngledTabEdge separatorBefore />
  </GameButton>;
}

type MenuTabButtonProps = Omit<ComponentPropsWithoutRef<"button">, "type" | "role" | "aria-selected"> & {
  selected: boolean;
  angled?: boolean;
  separatorBefore?: boolean;
};

/** Shared native tab surface. Each menu retains its own selection, roving
 * focus and controller routing; focusing a tab never commits by default. */
export const MenuTabButton = forwardRef<HTMLButtonElement, MenuTabButtonProps>(function MenuTabButton({
  selected, angled, separatorBefore, className = "", children, ...props
}, ref) {
  return (
    <button {...props} ref={ref} type="button" role="tab" aria-selected={selected}
      className={`${angled ? "angled-header-tab" : "menu-control"} ${className}`}>
      {children}
      {angled && <AngledTabEdge separatorBefore={separatorBefore} />}
    </button>
  );
});
