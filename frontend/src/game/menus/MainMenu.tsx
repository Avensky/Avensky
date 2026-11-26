import { ProgressBadge } from "../alpha/ProgressBadge";
import { useUIStore } from "../../store";
import { GameButton } from "../../components/GameButton";
import { useCallback, useEffect, useRef } from "react";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { MainMenuProfile } from "./MainMenuProfile";
import { GarageOrbitSurface } from "../preview/GarageOrbitSurface";

import { MAIN_MENU_ITEMS } from "./menuItems";

export function MainMenu() {
  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById.main);
  const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);
  const activate = useUIStore((s) => s.activateActiveMenuSelection);

  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const focusSelection = useCallback(() => itemRefs.current[selectedIndex]?.focus({ preventScroll: true }), [selectedIndex]);

  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (!el) return;

    el.focus({ preventScroll: true });
    el.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }, [selectedIndex]);

  return (
    <div className="game-ui menu-surface menu-home main-menu relative z-30">
      <GarageOrbitSurface />
      <MainMenuProfile focusMenu={focusSelection} />
      <div className="menu-home-content">
        <div className="main-menu-progression">
          <ProgressBadge />
        </div>
        <section className="main-menu-actions" aria-label="Main menu">
          <div className="menu-action-list">
            {MAIN_MENU_ITEMS.map((item, index) => (
              <GameButton
                key={item.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                selected={selectedIndex === index}
                variant="menu"
                aria-disabled={!item.available}
                onPress={() => {
                  setActiveMenuIndex(index);
                  activate();
                }}
                onFocus={() => setActiveMenuIndex(index)}
                className="menu-row menu-action"
              >
                <MenuIcon name={item.id} />
                {item.label}
                {!item.available && (
                  <span className="menu-control-note">Planned</span>
                )}
              </GameButton>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
