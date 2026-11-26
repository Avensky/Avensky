import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GameButton } from "../../components/GameButton";
import { MenuIcon, type MenuIconName } from "../../components/menus/MenuIcon";
import { requestSocial } from "../../net/socialClient";
import { playerDisplayName, useSocialStore } from "../../store/social/socialStore";
import { AccountActionForm, AccountEditForm, AccountFeedback, AccountSecurity, AccountSubmit, maskAccountEmail, useAccountSettings } from "./AccountSettings";
import "./garageProfilePanel.css";

type Setting = "name" | "email" | "security" | "invite" | "delete";

export function GarageProfilePanel({ onBack }: { onBack: () => void }) {
  const player = useSocialStore(s => s.view?.profile);
  const connected = useSocialStore(s => s.available);
  const settings = useAccountSettings();
  const { session, busy } = settings;
  const [expanded, setExpanded] = useState<Setting | null>(null);
  const panel = useRef<HTMLElement>(null);
  const id = useId();
  const name = playerDisplayName(player);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('[data-profile-setting="name"]')?.focus({ preventScroll: true });
  }, []);

  function toggle(setting: Setting) {
    if (busy) return;
    panel.current?.querySelector<HTMLElement>(`[data-profile-setting="${setting}"]`)?.focus({ preventScroll: true });
    settings.clearFeedback();
    setExpanded(previous => previous === setting ? null : setting);
  }
  function back() {
    if (busy) return;
    if (!expanded) { onBack(); return; }
    toggle(expanded);
  }
  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name === undefined || !connected) return;
    const value = String(new FormData(event.currentTarget).get("displayName") ?? "").trim();
    void settings.run(async () => {
      if (!value || Array.from(value).length > 24 || /\p{Cc}/u.test(value))
        throw new Error("Use 1–24 characters for your display name.");
      await requestSocial("rename", { name: value });
      return { message: "Display name saved." };
    });
  }
  function row(key: Setting, label: string, icon: MenuIconName, children: ReactNode, value?: string, available = true) {
    const open = expanded === key && available;
    return <div className="garage-profile-setting" data-setting={key}>
      <GameButton variant="menu" className="garage-profile-row menu-panel-frame" data-profile-setting={key}
        data-controller-row aria-label={label} aria-description={value}
        aria-expanded={open} aria-controls={id + key} disabled={busy || !available}
        onPress={() => toggle(key)}>
        <MenuIcon name={icon} />
        <span className="garage-profile-label"><strong>{label}</strong>{value && <small>{value}</small>}</span>
        {available && <span className="garage-profile-trailing"><MenuIcon name={key === "name" && !open && name !== undefined ? "edit" : "chevron"} /></span>}
      </GameButton>
      <div id={id + key} className="garage-profile-editor" hidden={!open}>{open && children}</div>
    </div>;
  }
  return <section ref={panel} className="garage-profile-panel menu-panel-frame" aria-label="Account settings"
    onFocusCapture={event => event.target.scrollIntoView?.({ block: "nearest", inline: "nearest" })}>
    <header className="garage-profile-heading">
      <GameButton variant="custom" className="garage-profile-back" aria-label="Back" title="Back"
        data-profile-back data-controller-row disabled={busy} onPress={back}><MenuIcon name="chevron" /></GameButton>
      <h2>Profile</h2>
    </header>
    {row("name", "Display name", "profile", name !== undefined ? <AccountEditForm onSubmit={saveName} busy={busy}>
      <label data-controller-row>Account display name
        <input name="displayName" autoComplete="nickname" defaultValue={name} maxLength={48} required disabled={busy} />
      </label>
      <AccountSubmit label="Save name" busy={busy || !connected} />
    </AccountEditForm> : <p>The game server needs an update to show your account display name.</p>, name ?? "Unavailable")}
    {row("email", "Email", "email", <AccountActionForm kind="email" settings={settings} />, session && maskAccountEmail(session.email), Boolean(session))}
    {row("security", "Sign-in & security", "lock", session && <AccountSecurity session={session} />, undefined, Boolean(session))}
    {row("invite", "Alpha tester invites", "social", <AccountActionForm kind="invite" settings={settings} />,
      session && !session.admin ? "Admin access required" : undefined, Boolean(session?.admin))}
    {row("delete", "Delete account", "trash", <AccountActionForm kind="delete" settings={settings} />, undefined, Boolean(session))}
    <AccountFeedback settings={settings} />
    {settings.unavailable && <div className="garage-profile-service"><p role="status">{settings.unavailable}</p>
      <GameButton variant="menu" data-controller-row className="account-submit"
        onPress={() => window.open("/__alpha/account", "_blank", "noopener,noreferrer")}>Open account portal</GameButton>
    </div>}
    {!session && !settings.unavailable && <p role="status" className="garage-profile-service">
      {settings.staging ? "Loading account…" : "Email and security settings are available to signed-in alpha testers."}
    </p>}
  </section>;
}
