import { useLayoutEffect, useRef } from "react";
import { GameButton } from "../../components/GameButton";
import { MenuIcon } from "../../components/menus/MenuIcon";
import { garageBrandContents } from "../../theme/garageEntry";
import { entryAssets } from "./config";

const brand = { __html: garageBrandContents(entryAssets) };

type AccountActions = {
  profileOpen: boolean;
  busy: boolean;
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

export function GarageEntryHeader({ showBrand, account }: { showBrand: boolean; account?: AccountActions }) {
  const tabs = useRosterTabFade(Boolean(account));
  if (!showBrand && !account) return null;
  return <header className="garage-entry-header angled-tab-header">
    {showBrand && <div className="garage-entry-brand" dangerouslySetInnerHTML={brand} />}
    {account && <nav ref={tabs} className="garage-entry-actions" aria-label="Account actions" data-controller-row data-controller-header-action>
      <GameButton variant="custom" className="garage-entry-action garage-entry-action--logout joined-header-action" aria-label="Log out" title="Log out"
        onPress={account.onLogOut} disabled={account.busy}><MenuIcon name="leave_game" /></GameButton>
      <GameButton variant="custom" className="garage-entry-action garage-entry-action--profile joined-header-action" aria-label="Profile" title="Profile"
        aria-pressed={account.profileOpen} onPress={account.onProfile} disabled={account.busy}><MenuIcon name="profile" /></GameButton>
    </nav>}
  </header>;
}
