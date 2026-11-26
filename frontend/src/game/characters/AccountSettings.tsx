import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GameButton } from "../../components/GameButton";
import { alphaAction, alphaSession, type AlphaSession } from "../../net/stagingAccount";
import { useSocialStore } from "../../store/social/socialStore";
import "./alphaAccountPanel.css";

type Feedback = { message: string; inviteUrl?: string; error?: boolean };
type FormKind = keyof typeof forms;
const forms = {
  email: { endpoint: "account/email-request", submit: "Request email change", fallback: "Email change requested." },
  invite: { endpoint: "testers/invite", submit: "Create invite", fallback: "Invitation created." },
  delete: { endpoint: "account/delete-request", submit: "Request profile deletion", fallback: "Deletion request submitted for review." },
} as const;

export function useAccountSettings() {
  const staging = useSocialStore(s => s.stagingSignIn);
  const owner = useSocialStore(s => s.view?.profile.id);
  const [session, setSession] = useState<AlphaSession>();
  const [unavailable, setUnavailable] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const generation = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    const token = ++generation.current;
    pending.current = false;
    setSession(undefined);
    setUnavailable("");
    setBusy(false);
    setFeedback(undefined);
    if (staging && owner) {
      let latestRead = 0;
      const load = () => {
        const read = ++latestRead;
        void alphaSession().then(value => {
          if (generation.current === token && latestRead === read) { setSession(value); setUnavailable(""); }
        }).catch(error => {
          if (generation.current === token && latestRead === read) {
            setSession(undefined);
            setUnavailable(error instanceof Error ? error.message : "Account service unavailable.");
          }
        });
      };
      load();
      // The authenticator setup lives in the existing secure account portal.
      // Read the confirmed factor and permissions when the player returns.
      window.addEventListener("focus", load);
      return () => { generation.current++; window.removeEventListener("focus", load); };
    }
    return () => { generation.current++; };
  }, [staging, owner]);

  async function run(task: () => Promise<Feedback | void>) {
    if (pending.current) return;
    const token = generation.current;
    pending.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      const result = await task();
      if (result && generation.current === token) setFeedback(result);
    } catch (error) {
      if (generation.current === token) setFeedback({ error: true, message: error instanceof Error ? error.message : "Request failed." });
    } finally {
      if (generation.current === token) { pending.current = false; setBusy(false); }
    }
  }
  return { staging, session: staging ? session : undefined, unavailable, busy, feedback, run, clearFeedback: () => setFeedback(undefined) };
}
type AccountSettings = ReturnType<typeof useAccountSettings>;

export function maskAccountEmail(email: string) {
  const at = email.lastIndexOf("@");
  return at > 0 ? Array.from(email)[0] + "•••" + email.slice(at) : "•••";
}

export function AccountEditForm({ onSubmit, busy, children }: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; children: ReactNode;
}) {
  return <form method="post" className="account-action-form" onSubmit={onSubmit} aria-busy={busy}
    onKeyDown={event => {
      if (event.key === "Enter" && !event.nativeEvent.isComposing && event.target instanceof HTMLInputElement) {
        event.preventDefault(); event.stopPropagation();
        if (!busy) event.currentTarget.requestSubmit();
      }
    }}>{children}</form>;
}

export function AccountSubmit({ label, busy }: { label: string; busy: boolean }) {
  const control = useRef<HTMLDivElement>(null);
  return <div data-controller-row>
    <GameButton ref={control} variant="menu" className="account-submit" disabled={busy}
      onPress={() => control.current?.closest("form")?.requestSubmit()}>{label}</GameButton>
  </div>;
}

export function AccountActionForm({ kind, settings }: { kind: FormKind; settings: AccountSettings }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings.session || (kind === "invite" && !settings.session.admin)) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    void settings.run(async () => {
      const result = await alphaAction(forms[kind].endpoint, fields);
      form.reset();
      return {
        message: result.message || (kind === "invite" && result.sent ? "Invitation sent." : forms[kind].fallback),
        inviteUrl: kind === "invite" ? result.url : undefined,
      };
    });
  }
  const label = kind === "invite" ? "Tester email" : kind === "email" ? "New email" : "Confirm your email";
  const emailField = kind === "invite" ? "email" : kind === "email" ? "newEmail" : "confirmEmail";
  return <AccountEditForm onSubmit={submit} busy={settings.busy}>
    {kind === "delete" && <small>An operator reviews your request before deleting your profile.</small>}
    <label data-controller-row>{label}
      <input type="email" name={emailField} autoComplete={kind === "email" ? "email" : "off"}
        autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={settings.busy} />
    </label>
    {kind !== "invite" && <label data-controller-row>Current password
      <input type="password" name="password" autoComplete="current-password" maxLength={256} required disabled={settings.busy} />
    </label>}
    {kind === "email" && <small>Your current email stays active until the change is verified.</small>}
    <AccountSubmit label={forms[kind].submit} busy={settings.busy} />
  </AccountEditForm>;
}

export function AccountSecurity({ session }: { session: AlphaSession }) {
  return <div className="account-security">
    <p>Two-factor authentication is {session.hasMfa ? "enabled" : "off"}.</p>
    {!session.hasMfa && <div data-controller-row><GameButton variant="menu" className="account-submit" onPress={() =>
      window.open("/__alpha/account#two-factor", "_blank", "noopener,noreferrer")
    }>Set up authenticator<span className="sr-only"> in a new tab</span></GameButton></div>}
  </div>;
}

function InvitationLink({ url }: { url: string }) {
  const field = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Invite link copied.");
    } catch {
      field.current?.focus({ preventScroll: true });
      field.current?.select();
      setMessage("Select Copy to copy the invitation link.");
    }
  }
  return <>
    <label className="account-invite-result" data-controller-row>Private invitation link
      <input ref={field} value={url} readOnly onFocus={event => event.currentTarget.select()} />
    </label>
    <div data-controller-row><GameButton variant="menu" className="account-submit" onPress={() => void copy()}>Copy invite link</GameButton></div>
    {message && <p role="status">{message}</p>}
  </>;
}

export function AccountFeedback({ settings }: { settings: AccountSettings }) {
  if (settings.busy) return <p role="status" className="alpha-account-response">Sending request…</p>;
  const result = settings.feedback;
  if (!result) return null;
  return <>
    <p role={result.error ? "alert" : "status"} className="alpha-account-response">{result.message}</p>
    {settings.session?.admin && result.inviteUrl && <InvitationLink key={result.inviteUrl} url={result.inviteUrl} />}
  </>;
}
