/** Same-origin staging access. Never persist passwords, invite links, or session tokens. */
export type AlphaSession = { email: string; admin: boolean; hasMfa: boolean };
export type AlphaResponse = { message?: string; error?: string; email?: string; sent?: boolean; url?: string };

export async function alphaSession(): Promise<AlphaSession> {
  const response = await fetch("/__alpha/session", {
    credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
    throw new Error("The staging account service needs an update. Open the Account portal instead.");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") throw new Error("Account information is unavailable.");
  const fields = value as Partial<AlphaSession>;
  if (typeof fields.email !== "string" || typeof fields.admin !== "boolean")
    throw new Error("Account information is unavailable.");
  return { email: fields.email, admin: fields.admin, hasMfa: fields.hasMfa === true };
}

export async function alphaAction(endpoint: "testers/invite" | "account/email-request" | "account/delete-request",
  fields: Record<string, string>): Promise<AlphaResponse> {
  const response = await fetch("/__alpha/" + endpoint, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("This account action is unavailable until staging access is updated.");
  const value = await response.json() as AlphaResponse;
  if (!response.ok) throw new Error(value.error || "The account request could not be completed.");
  return value;
}

export const sessionEndNotices = {
  "session-replaced": "You signed in on another device. Sign in again to play here. If this wasn’t you, use Forgot password.",
  "session-expired": "Your session ended. Sign in again to play.",
};
export type SessionEndReason = keyof typeof sessionEndNotices;
type PortalNavigation = { showSignIn(signOut: boolean, notice?: string): Promise<void> };
let returning: { signOut: boolean; done: Promise<void> } | undefined;

/** The server may close the game socket while its sign-out POST is in flight. */
export function returnToStagingSignIn(signOut = false, reason?: SessionEndReason): Promise<void> {
  if (returning) {
    if (!signOut || returning.signOut) return returning.done;
    // A passive session check must never consume a player's explicit revocation.
    return returning.done.catch(() => {}).then(() => returnToStagingSignIn(true));
  }
  const done = (async () => {
    const portal = window as Window & { avenskyPortalNavigation?: PortalNavigation };
    if (!portal.avenskyPortalNavigation) {
      const script = "/__alpha/entry/sign-in-navigation.js";
      await import(/* @vite-ignore */ script);
    }
    const navigation = portal.avenskyPortalNavigation;
    if (!navigation) throw new Error("The staging sign-in page is unavailable. Try again.");
    await navigation.showSignIn(signOut, reason && sessionEndNotices[reason]);
  })().finally(() => { returning = undefined; });
  returning = { signOut, done };
  return done;
}
