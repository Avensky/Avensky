import { ProgressBadge } from "../alpha/ProgressBadge";
import { useUIStore } from "../../store";
import { GameButton } from "../../components/GameButton";
import { useCallback, useEffect, useRef } from "react";
import { MenuLogo } from "../../components/menus/MenuLogo";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { MenuFlareBackground } from "../../components/menus/MenuFlareBackground";
import { MainMenuProfile } from "./MainMenuProfile";

import { useSocialStore } from "../../store/social/socialStore";
import { mainMenuItems } from "./menuItems";
import { openWorldForView } from "../social/openWorld";

export function MainMenu() {
  const mainWorld = useSocialStore(s => openWorldForView(s.view));
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
      <MenuFlareBackground animated />
      <MainMenuProfile focusMenu={focusSelection} />
      <div className="menu-home-content">
        <section className="main-menu-identity" aria-label="Avensky">
          <header className="menu-brand menu-brand-main">
            <MenuLogo />
            <div className="menu-brand-copy">
              <h1 className="menu-brand-title">AVENSKY</h1>
              <p className="menu-brand-tagline">Vehicle simulation, world building, and real-time multiplayer.</p>
            </div>
          </header>

          <ProgressBadge />
        </section>
        <section className="main-menu-actions" aria-label="Main menu">
          <div className="menu-action-list">
            {mainMenuItems(mainWorld).map((item, index) => (
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
