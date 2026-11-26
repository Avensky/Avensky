import { useId, useState, type ReactNode } from "react";
import { useSocialStore } from "../../store/social/socialStore";
import { useUIStore } from "../../store/menus/uiStore";
import { signOutPlayerProfile } from "../../net/socialClient";
import { AccountActionForm, AccountFeedback, AccountSecurity, maskAccountEmail, useAccountSettings } from "./AccountSettings";
import { MenuIcon, type MenuIconName } from "../../components/menus/MenuIcon";
import { styleName } from "../characters/characterStyles";
import { ProfilePortrait } from "../characters/CharacterPortrait";

type Tab = "profile" | "account";

type Setting = "email" | "security" | "delete";

function AccountRow({ label, value, icon, expanded, onToggle, children }: {
  label: string; value?: string; icon: MenuIconName; expanded: boolean; onToggle: () => void; children: ReactNode;
}) {
  const id = useId();
  return <section className="alpha-setting" data-setting={icon}>
    <div data-controller-row>
      <button type="button" className="alpha-setting-toggle" onClick={onToggle} aria-expanded={expanded} aria-controls={id}>
        <MenuIcon name={icon} /><span><strong>{label}</strong>{value && <small>{value}</small>}</span>
      </button>
    </div>
    <div id={id} hidden={!expanded}>{expanded && children}</div>
  </section>;
}

export function AlphaAccountPanel({ tab }: { tab: Tab }) {
  const player = useSocialStore(s => s.view?.profile);
  const settings = useAccountSettings();
  const { session, unavailable, busy, staging: isStaging } = settings;
  const active = player?.characters?.find(slot => slot.id === player.active_character_id);
  const [openSetting, setOpenSetting] = useState<Setting | null>(null);
  function toggle(setting: Setting) {
    if (busy) return;
    setOpenSetting(current => current === setting ? null : setting);
    settings.clearFeedback();
  }
  function logout() {
    void settings.run(async () => {
      if (await signOutPlayerProfile() !== "portal") useUIStore.getState().setScreen("welcome");
    });
  }

  return <section className="alpha-account-panel menu-panel-frame" aria-label={tab === "profile" ? "Character profile" : "Account settings"} data-controller-rows>
    {tab === "profile" ? <>
      <div className="alpha-profile-hero">
        <ProfilePortrait choice={active?.appearance ?? player?.progression?.character} label={active?.name ?? player?.name ?? "Player portrait"} welcomePreview="selected" />
        <div className="alpha-profile-facts">
          <strong>{active?.name ?? player?.name ?? "Player"}</strong>
          <span>{active ? styleName(active.style) : "Your character"}</span>
          <span>Level {active?.level ?? 1}</span>
          <small>{player?.characters?.length ?? 0} saved {player?.characters?.length === 1 ? "character" : "characters"}</small>
        </div>
      </div>
      {session?.admin && <section className="alpha-profile-invite">
        <h2>Alpha tester invites</h2>
        <AccountActionForm kind="invite" settings={settings} />
      </section>}
      {session && !session.admin && <p className="alpha-account-hint">Alpha invitations are managed by the game master.</p>}
    </> : <>
      {session && <>
        <AccountRow label="Email" value={maskAccountEmail(session.email)} icon="email" expanded={openSetting === "email"} onToggle={() => toggle("email")}>
          <AccountActionForm kind="email" settings={settings} />
        </AccountRow>
        <AccountRow label="Sign-in & security" icon="lock" expanded={openSetting === "security"} onToggle={() => toggle("security")}>
          <AccountSecurity session={session} />
        </AccountRow>
        <AccountRow label="Delete profile" icon="trash" expanded={openSetting === "delete"} onToggle={() => toggle("delete")}>
          <AccountActionForm kind="delete" settings={settings} />
        </AccountRow>
        <div data-controller-row><button type="button" className="menu-control" disabled={busy} onClick={logout}>Log out</button></div>
      </>}
    </>}
    {unavailable && <p role="status" className="alpha-account-hint">{unavailable}
      {" "}<a href="/__alpha/account" target="_blank" rel="noopener noreferrer">Open account portal</a>
    </p>}
    {!session && !unavailable && isStaging && <p role="status">Loading account…</p>}
    {!isStaging && <p className="alpha-account-hint">Account tools are available to signed-in alpha testers.</p>}
    <AccountFeedback settings={settings} />
  </section>;
}
