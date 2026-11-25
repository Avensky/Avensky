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
