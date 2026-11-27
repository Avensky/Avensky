import { useLayoutEffect, useRef } from "react";
import { GameButton } from "../../components/GameButton";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { garageBrandIdentity } from "../../theme/garageEntry";
import { entryAssets } from "./config";
import "./welcomeScreen.css";

const { logo, name } = garageBrandIdentity(entryAssets);
const brand = <><img src={logo} width={26} height={26} alt="" draggable={false} /><span>{name}</span></>;

type AccountActions = {
  profileOpen: boolean;
  busy: boolean;
  onBack: () => void;
  onProfile: () => void;
  onLogOut: () => void;
};

const retiredHeader = "garage-roster-header-exit";

function motionEnabled() {
  return !document.hidden && document.documentElement.dataset.reduceMotion !== "true"
    && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function useRosterTabFade(visible: boolean) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const tabs = ref.current;
    const header = tabs?.parentElement;
    if (!visible || !tabs || !header?.animate) return;
    const previous = document.getElementById(retiredHeader);
    const from = previous ? Number(getComputedStyle(previous).opacity) : 0;
    previous?.remove();
    // Sign-in already fades the entire incoming header in time with the camera.
    const reveal = motionEnabled() && !document.documentElement.hasAttribute("data-entry-handoff")
      ? header.animate([{ opacity: from }, { opacity: 1 }], { duration: 220, easing: "ease-out" }) : null;
    return () => {
      const opacity = Number(getComputedStyle(header).opacity || 1);
      reveal?.cancel();
      queueMicrotask(() => {
        // React can replay this effect or restore the roster within the same commit.
        // On logout, the public sign-in page takes ownership of its own header.
        if (tabs.isConnected || document.querySelector(".welcome-screen .garage-entry-actions") ||
            document.documentElement.hasAttribute("data-logout-handoff") ||
            document.body.classList.contains("garage-entry") || !motionEnabled() || opacity === 0) return;
        const shell = document.createElement("header");
        shell.id = retiredHeader;
        shell.className = "garage-entry-header angled-tab-header";
        shell.inert = true;
        shell.setAttribute("aria-hidden", "true");
        // Retire the actual tab faces. Their React handlers have already detached.
        tabs.removeAttribute("data-controller-row");
        tabs.removeAttribute("data-controller-header-action");
        for (const action of tabs.children) {
          action.removeAttribute("role");
          action.removeAttribute("tabindex");
        }
        document.getElementById(retiredHeader)?.remove();
        const wordmark = tabs.previousElementSibling;
        if (wordmark?.classList.contains("garage-entry-brand")) shell.append(wordmark);
        shell.append(tabs);
        document.body.append(shell);
        const exit = shell.animate([{ opacity }, { opacity: 0 }], { duration: 180, easing: "ease-in" });
        exit.onfinish = exit.oncancel = () => shell.remove();
      });
    };
  }, [visible]);
  return ref;
}

const shortcuts = [
  { id: "career", label: "Career" },
  { id: "social", label: "Social" },
  { id: "settings", label: "Settings" },
] as const;

type MenuShortcuts = {
  busy: boolean;
  onBack: () => void;
  onOpen: (screen: (typeof shortcuts)[number]["id"]) => void;
};

export function GarageEntryHeader({ showBrand, account, menu, backAction }: {
  showBrand: boolean; account?: AccountActions; menu?: MenuShortcuts; backAction?: { onBack: () => void; busy: boolean; label: string };
}) {
  const tabs = useRosterTabFade(Boolean(account));
  if (!showBrand && !account && !menu) return null;
  const back = backAction ?? menu ?? (account?.profileOpen ? account : null);
  return <header className="garage-entry-header angled-tab-header">
    {showBrand && (back
      ? <GameButton variant="custom" className="garage-entry-brand garage-entry-brand-back"
        aria-label={backAction?.label ?? (menu ? "Back to character selection" : "Back")} title="Back"
        data-profile-back={account ? true : undefined} data-profile-header-tab={account ? true : undefined}
        data-controller-header-action disabled={back.busy} onPress={back.onBack}><MenuIcon name="back" />{brand}</GameButton>
      : <div className="garage-entry-brand">{brand}</div>)}
    {account && <nav ref={tabs} className="garage-entry-actions" aria-label="Account actions" data-controller-row
      data-controller-header-action data-controller-tab-only={account.profileOpen || undefined}>
      <GameButton variant="custom" className="garage-entry-action garage-entry-action--inner garage-entry-action--logout joined-header-action" aria-label="Log out" title="Log out"
        data-profile-header-tab={account.profileOpen || undefined} onPress={account.onLogOut} disabled={account.busy}><MenuIcon name="leave_game" /></GameButton>
      <GameButton variant="custom" className="garage-entry-action garage-entry-action--outer garage-entry-action--profile joined-header-action" aria-label="Profile" title="Profile"
        aria-pressed={account.profileOpen} data-profile-header-tab={account.profileOpen || undefined} onPress={account.onProfile} disabled={account.busy}><MenuIcon name="profile" /></GameButton>
    </nav>}
    {menu && <nav className="garage-entry-actions" aria-label="Garage shortcuts">
      {shortcuts.map(({ id, label }, index) => <GameButton key={id} variant="custom"
        className={`garage-entry-action garage-entry-action--${index === shortcuts.length - 1 ? "outer" : "inner"} joined-header-action`}
        aria-label={label} title={label} disabled={menu.busy} onPress={() => menu.onOpen(id)}>
        <MenuIcon name={id} />
      </GameButton>)}
    </nav>}
  </header>;
}
