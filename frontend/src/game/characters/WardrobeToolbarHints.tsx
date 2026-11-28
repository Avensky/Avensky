import { ControlGlyph } from "../../components/controller";
import { useMenuInputDevice } from "../../components/controller/useMenuInputDevice";
import { MenuIcon } from "../../components/menus/MenuIcon";

export function WardrobeToolbarHints({ onCycle }: { onCycle: (direction: number) => void }) {
  const touch = useMenuInputDevice() === "touch";
  function directionButton(previous: boolean) {
    const label = previous ? "Previous toolbar" : "Next toolbar";
    return <button type="button" aria-label={label} title={label}
      onPointerDown={event => { if (event.button === 0) event.preventDefault(); }}
      onClick={() => onCycle(previous ? -1 : 1)}>
      {touch ? <MenuIcon name="chevron" /> : <ControlGlyph controller={previous ? "LT" : "RT"} keyboard={previous ? "1" : "3"} />}
    </button>;
  }
  return <div className="wardrobe-toolbar-hints" role="group" aria-label="Switch toolbar">
    {directionButton(true)}<span>Toolbar</span>{directionButton(false)}
  </div>;
}
