import { returnToStagingSignIn } from "./stagingAccount";
import { stagingAccountPortal } from "../game/welcome/config";
import { usePresenceStore } from "../store/chat/presenceStore";
import { playerDisplayName, useSocialStore } from "../store/social/socialStore";
import { useChatStore } from "../store/chat/chatStore";
import { useNetworkStore } from "../store/session/networkStore";

type Identity = { id: string; token: string; name: string };
type IdentityScope = "device" | "tab";
type IdentitySource = "saved" | "device" | "new-device" | "new-tab";
type Response = {
  request_id?: string;
  ok?: boolean;
  data?: Record<string, unknown>;
  message?: string;
};
let connection: WebSocket | null = null;
let identityKey = "";
let sequence = 0;
let initialized = false;
const pending = new Map<
  string,
  {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

// A secondary player belongs to this tab. Never overwrite the device's main
// credential when opening another player for local multiplayer testing.
const readStoredIdentity = (storage: () => Storage, key: string): Identity | null => {
  try {
    const value = JSON.parse(storage().getItem(key) ?? "null");
    return typeof value?.id === "string" && typeof value?.token === "string" && value.token.length === 64
      ? {id:value.id,token:value.token,name:typeof value.name === "string" ? value.name : "DRIVER"}
      : null;
  } catch { return null; }
};
const readIdentity = (): {identity:Identity;scope:IdentityScope} | null => {
  const tab = readStoredIdentity(() => window.sessionStorage, `${identityKey}:tab`);
  if (tab) return {identity:tab,scope:"tab"};
  const device = readStoredIdentity(() => localStorage, identityKey);
  return device ? {identity:device,scope:"device"} : null;
};
const saveIdentity = (value: Identity, scope:IdentityScope) => {
  try {
    if (scope === "tab") window.sessionStorage.setItem(`${identityKey}:tab`, JSON.stringify(value));
    else {
      localStorage.setItem(identityKey, JSON.stringify(value));
      window.sessionStorage.removeItem(`${identityKey}:tab`);
    }
  } catch { /* Restricted storage keeps this profile only for this page. */ }
};
let pageIdentity: Identity | null = null;
let pageIdentityScope:IdentityScope = "device";
let connectionGeneration = 0;
let identifying = false;

/** One request owner with bounded pending work. Closing a socket rejects every
 * pending command immediately; old replies cannot resolve a replacement session. */
export function setSocialConnection(next: WebSocket | null) {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error("The game connection closed."));
  }
  pending.clear();
  connection = next;
  connectionGeneration++;
  identifying = false;
  initialized = false;
  pageIdentity = null;
  identityKey = "";
  useSocialStore.getState().reset();
  useChatStore.getState().reset();
  usePresenceStore.getState().reset();
}
export function requestSocial(
  action: string,
  fields: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const socket = connection;
  if (!socket || socket.readyState !== WebSocket.OPEN)
    return Promise.reject(new Error("Connect to the game server first."));
  if (pending.size >= 8)
    return Promise.reject(new Error("Wait for the current request to finish."));
  const request_id = `social-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(request_id);
      reject(
        new Error("The server did not respond. Refresh before trying again."),
      );
    }, 12000);
    pending.set(request_id, { resolve, reject, timer });
    try {
      socket.send(
        JSON.stringify({
          type: "social_request",
          ...fields,
          action,
          request_id,
        }),
      );
    } catch {
      clearTimeout(timer);
      pending.delete(request_id);
      reject(new Error("Could not send the request."));
    }
  });
}
export function receiveSocialResult(value: Response) {
  if (typeof value.request_id !== "string") return;
  const request = pending.get(value.request_id);
  if (!request) return;
  pending.delete(value.request_id);
  clearTimeout(request.timer);
  if (value.ok === true) request.resolve(value.data ?? {});
  else
    request.reject(
      new Error(value.message || "The server rejected the request."),
    );
}
type AccountCredentials = { login: string; password: string };

async function identifyProfile(name: string | undefined, source: IdentitySource, account?: AccountCredentials) {
  if (identifying) throw new Error("Wait for player profile restoration to finish.");
  const generation=connectionGeneration;
  const saved = readIdentity();
  const identity = account ? null : source === "saved" ? pageIdentity ?? saved?.identity
    : source === "device" ? readStoredIdentity(() => localStorage, identityKey) : null;
  const scope: IdentityScope = source === "new-tab" ? "tab"
    : source === "saved" ? (pageIdentity ? pageIdentityScope : saved?.scope ?? "device") : "device";
  identifying=true;
  useSocialStore.setState({profileStatus:"restoring",message:source === "new-tab" ? "Creating a player for this tab…" : "Connecting your player profile…"});
  try {
    const action = account ? name === undefined ? "account_login" : "account_register" : "identify";
    const result=await requestSocial(action,{
      ...(identity ? {token:identity.token} : {}),
      ...(account ?? {}),
      name:name??identity?.name??"DRIVER",
    });
    if(generation!==connectionGeneration) throw new Error("The game connection changed. Try again after reconnecting.");
    const token=typeof result.token==="string"?result.token:identity?.token;
    if(typeof result.profile_id!=="string"||!token||token.length!==64)
      throw new Error("The server did not confirm the player profile. Retry your saved profile.");
    pageIdentity={id:result.profile_id,token,name:typeof result.name === "string" ? result.name : name??identity?.name??"DRIVER"};
    pageIdentityScope=scope;
    saveIdentity(pageIdentity,scope);
    useSocialStore.setState({profileScope:scope, registeredProfile:result.account === true});
    // The confirmed social_state owns readiness; a reply alone is not a view.
    return result.profile_id;
  } catch(error) {
    if(generation===connectionGeneration)useSocialStore.setState({profileStatus:"error",message:error instanceof Error?error.message:"Player profile restoration failed."});
    throw error;
  } finally {
    if(generation===connectionGeneration)identifying=false;
  }
}
export async function identifySocial(name?:string,newProfile=false) {
  await identifyProfile(name,newProfile ? "new-device" : "saved");
}
export async function signInDeviceProfile() {
  await identifyProfile(undefined, "device");
}
export async function createGuestProfile() {
  await selectGuestProfile("GUEST");
}
export function selectGuestProfile(name: string) {
  return identifyProfile(name, "new-tab");
}
export function selectAccount(credentials: AccountCredentials, name?: string) {
  const socket = connection && new URL(connection.url);
  if (!socket || (socket.protocol !== "wss:" && !["localhost", "127.0.0.1", "[::1]"].includes(socket.hostname)))
    return Promise.reject(new Error("Use a secure game connection to sign in."));
  return identifyProfile(name, "new-device", credentials);
}
export async function signOutPlayerProfile() {
  if (useSocialStore.getState().stagingSignIn || stagingAccountPortal) {
    await returnToStagingSignIn(true);
    return "portal";
  }
  const generation = connectionGeneration;
  const key = identityKey;
  const saved = readIdentity();
  const identity = pageIdentity ?? saved?.identity;
  const scope = pageIdentity ? pageIdentityScope : saved?.scope;
  await requestSocial("account_logout", identity ? { token:identity.token } : {});
  if (generation !== connectionGeneration) throw new Error("The game connection changed. Try signing out again.");
  try {
    if (scope === "tab") sessionStorage.removeItem(`${key}:tab`);
    else {
      localStorage.removeItem(key);
      sessionStorage.removeItem(`${key}:tab`);
    }
  } catch { /* Private browsing may disallow storage access. */ }
  pageIdentity = null;
  useSocialStore.setState({profileOwner:null,cachedCosmetics:null,view:null,profileScope:null,registeredProfile:false});
}
/** Explicitly create another authenticated player without changing the saved
 * main profile. Duplicated tabs may inherit sessionStorage and can use this
 * action again if their copied profile is still connected elsewhere. */
export async function createTabProfile() {
  await identifyProfile("DRIVER 2", "new-tab");
}
export function beginSocialSession(serverId: unknown, onFailure?: () => void, accounts = false, bodyTattoos = false, stagingSignIn = false) {
  if (initialized || typeof serverId !== "string") return;
  initialized = true;
  identityKey = `avenlab-social-profile-v1:${serverId}`;
  const saved = stagingSignIn ? null : readIdentity();
  useSocialStore.setState({
    available: true,
    accountsAvailable: accounts,
    stagingSignIn,
    ...(stagingSignIn ? { registeredProfile: true } : {}),
    bodyTattoosAvailable: bodyTattoos,
    profileScope: stagingSignIn ? "device" : saved?.scope ?? null,
    profileStatus: saved || stagingSignIn ? "restoring" : "idle",
    message: saved || stagingSignIn ? "Restoring your player profile…" : "Sign in on this device or continue as a guest.",
  });
  if (saved) void identifySocial().catch(() => onFailure?.());
}
export function receiveSocialState(value: unknown) {
  useSocialStore.getState().receive(value);
  const view = useSocialStore.getState().view;
  useChatStore
    .getState()
    .membership(
      view?.profile.id ?? null,
      view?.current_world_id ?? null,
      view?.alpha?.active?.team ?? useNetworkStore.getState().team,
    );
  if (view) usePresenceStore.getState().observe(view);
  const profile = useSocialStore.getState().view?.profile;
  const saved = readIdentity();
  const identity = pageIdentity ?? saved?.identity;
  const accountName = playerDisplayName(profile);
  if (
    profile &&
    identity &&
    profile.id === identity.id &&
    typeof accountName === "string" &&
    accountName !== identity.name
  ) {
    pageIdentityScope = pageIdentity ? pageIdentityScope : saved?.scope ?? "device";
    pageIdentity = { ...identity, name: accountName };
    saveIdentity(pageIdentity,pageIdentityScope);
  }
}
