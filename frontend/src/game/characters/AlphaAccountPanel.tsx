import { useEffect, useState, type FormEvent } from "react";
import { useSocialStore } from "../../store/social/socialStore";
import { useUIStore } from "../../store/menus/uiStore";
import { signOutPlayerProfile } from "../../net/socialClient";
import { alphaAction, alphaSession, type AlphaSession } from "../../net/stagingAccount";
import { styleName } from "../characters/characterStyles";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import "./alphaAccountPanel.css";

type Tab = "profile" | "account";

export function AlphaAccountPanel({ tab }: { tab: Tab }) {
  const player = useSocialStore(s => s.view?.profile);
  const isStaging = useSocialStore(s => s.stagingSignIn);
  const active = player?.characters?.find(slot => slot.id === player.active_character_id);
  const [session, setSession] = useState<AlphaSession | null>(null);
  const [unavailable, setUnavailable] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
        <div className="alpha-profile-portrait"><CharacterPortrait choice={active?.appearance ?? player?.progression?.character} label={active?.name ?? player?.name ?? "Player portrait"} welcomePreview="selected" /></div>
        <div className="alpha-profile-facts">
          <strong>{active?.name ?? player?.name ?? "Player"}</strong>
          <span>{active ? styleName(active.style) : "Your character"}</span>
          <span>Level {active?.level ?? 1}</span>
          <small>{player?.characters?.length ?? 0} saved character(s)</small>
          {session && <small>{session.email}</small>}
        </div>
      </div>
      {session?.admin && <section className="alpha-profile-invite">
        <h2>Alpha tester invites</h2>
        <p>Invite another tester to this private staging build.</p>
        <form onSubmit={event => void submit(event, "testers/invite")}>
          <label>Email <input name="email" type="email" maxLength={254} autoComplete="off" required /></label>
          <button type="submit" className="menu-control" disabled={busy}>Create invite</button>
        </form>
        {inviteUrl && <label>Private invitation link
          <input value={inviteUrl} readOnly onFocus={event => event.currentTarget.select()} />
        </label>}
      </section>}
      {session && !session.admin && <p className="alpha-account-hint">Alpha invitations are managed by the game master.</p>}
    </> : <>
      <h2>Email & account</h2>
      {session && <p>Signed in as <strong>{session.email}</strong></p>}
      {session && <form onSubmit={event => void submit(event, "account/email-request")}>
        <label>New email <input name="newEmail" type="email" maxLength={254} autoComplete="email" required /></label>
        <label>Current password <input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit" className="menu-control" disabled={busy}>Request email change</button>
        <small>Email changes require verification; your old email remains active until reviewed.</small>
      </form>}
      {session && <section className="alpha-account-danger">
        <h2>Profile deletion</h2>
        <p>Request permanent removal for review. This does not immediately delete characters or worlds.</p>
        <form onSubmit={event => void submit(event, "account/delete-request")}>
          <label>Type your account email <input name="confirmEmail" type="email" maxLength={254} autoComplete="off" required /></label>
          <label>Current password <input name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit" className="menu-control" disabled={busy}>Request profile deletion</button>
        </form>
      </section>}
      {session && <button type="button" className="menu-control" disabled={busy} onClick={() => void logout()}>Log out</button>}
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
