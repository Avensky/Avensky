import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { useSocialStore } from "../../store/social/socialStore";
import { useUIStore } from "../../store/menus/uiStore";
import { signOutPlayerProfile } from "../../net/socialClient";
import { alphaAction, alphaSession, type AlphaSession } from "../../net/stagingAccount";
import { MenuIcon, type MenuIconName } from "../../components/menus/MenuIcon";
import { styleName } from "../characters/characterStyles";
import { ProfilePortrait } from "../characters/CharacterPortrait";
import "./alphaAccountPanel.css";

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
  const isStaging = useSocialStore(s => s.stagingSignIn);
  const active = player?.characters?.find(slot => slot.id === player.active_character_id);
  const [session, setSession] = useState<AlphaSession | null>(null);
  const [unavailable, setUnavailable] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [openSetting, setOpenSetting] = useState<Setting | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");

  useEffect(() => {
    if (!isStaging) return;
    let cancelled = false;
    void alphaSession().then(value => {
      if (!cancelled) { setSession(value); setUnavailable(""); }
    }).catch(error => {
      if (!cancelled) setUnavailable(error instanceof Error ? error.message : "Account service unavailable.");
    });
    return () => { cancelled = true; };
  }, [isStaging]);

  async function submit(event: FormEvent<HTMLFormElement>, action: "testers/invite" | "account/email-request" | "account/delete-request") {
    event.preventDefault();
    if (!session || busy) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    setBusy(true);
    setMessage("");
    setInviteUrl("");
    try {
      const result = await alphaAction(action, fields);
      setMessage(result.message || (result.sent ? "Invitation sent." : "Invitation created."));
      if (action === "testers/invite" && result.url) setInviteUrl(result.url);
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally { setBusy(false); }
  }

  function toggle(setting: Setting) {
    setOpenSetting(current => current === setting ? null : setting);
    setMessage("");
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await signOutPlayerProfile();
      useUIStore.getState().setScreen("welcome");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not log out.");
    } finally { setBusy(false); }
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
        <form onSubmit={event => void submit(event, "testers/invite")}>
          <label data-controller-row>Email <input name="email" type="email" maxLength={254} autoComplete="off" required /></label>
          <div data-controller-row><button type="submit" className="menu-control" disabled={busy}>Create invite</button></div>
        </form>
        {inviteUrl && <label data-controller-row>Private invitation link
          <input value={inviteUrl} readOnly onFocus={event => event.currentTarget.select()} />
        </label>}
      </section>}
      {session && !session.admin && <p className="alpha-account-hint">Alpha invitations are managed by the game master.</p>}
    </> : <>
      {session && <>
        <AccountRow label="Email" value={session.email} icon="email" expanded={openSetting === "email"} onToggle={() => toggle("email")}>
          <form onSubmit={event => void submit(event, "account/email-request")}>
            <label data-controller-row>New email <input name="newEmail" type="email" maxLength={254} autoComplete="email" required /></label>
            <label data-controller-row>Current password <input name="password" type="password" autoComplete="current-password" required /></label>
            <small>Your current email stays active until the change is verified.</small>
            <div data-controller-row><button type="submit" className="menu-control" disabled={busy}>Request email change</button></div>
          </form>
        </AccountRow>
        <AccountRow label="Sign-in & security" icon="lock" expanded={openSetting === "security"} onToggle={() => toggle("security")}>
          <div className="alpha-setting-body" data-controller-row>
            <p>Two-factor authentication is {session.hasMfa ? "enabled" : "off"}.</p>
            {!session.hasMfa && <button type="button" className="menu-control" onClick={() => window.location.assign("/__alpha/account#two-factor")}>Set up authenticator</button>}
          </div>
        </AccountRow>
        <AccountRow label="Delete profile" icon="trash" expanded={openSetting === "delete"} onToggle={() => toggle("delete")}>
          <form onSubmit={event => void submit(event, "account/delete-request")}>
            <small>An operator reviews your request before deleting your profile.</small>
            <label data-controller-row>Confirm your email <input name="confirmEmail" type="email" maxLength={254} autoComplete="off" required /></label>
            <label data-controller-row>Current password <input name="password" type="password" autoComplete="current-password" required /></label>
            <div data-controller-row><button type="submit" className="menu-control" disabled={busy}>Request profile deletion</button></div>
          </form>
        </AccountRow>
        <div data-controller-row><button type="button" className="menu-control" disabled={busy} onClick={() => void logout()}>Log out</button></div>
      </>}
    </>}
    {unavailable && <p role="status" className="alpha-account-hint">{unavailable}
      {" "}<a href="/__alpha/account">Open account portal</a>
      {tab === "profile" && <><br />Alpha tester invites: <a href="/__alpha/testers">Manage tester invitations</a></>}
    </p>}
    {!session && !unavailable && isStaging && <p role="status">Loading account…</p>}
    {!isStaging && <p className="alpha-account-hint">Account tools are available to signed-in alpha testers.</p>}
    {message && <p role="status" className="alpha-account-response">{message}</p>}
  </section>;
}
