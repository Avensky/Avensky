/** Build-time connection policy. VITE_* values are public, never credentials.
 * Environments are explicit: staging/test builds must not fall through to live.
 */
export type DeploymentEnvironment = "development" | "test" | "staging" | "production";

export interface WebSocketEnvironment {
  mode: string;
  deployment?: string;
  configuredUrl?: string;
  pageUrl: string;
}

const LIVE_SOCKET = "wss://api.avensky.com/ws/";
const LIVE_PAGE_HOST = "play.avensky.com";
const LIVE_API_HOST = "api.avensky.com";

export function resolveDeploymentEnvironment(mode: string, deployment?: string): DeploymentEnvironment {
  const selected = (deployment?.trim() || mode.trim()).toLowerCase();
  if (!["development", "test", "staging", "production"].includes(selected))
    throw new Error(`Unknown Avensky deployment environment: ${selected || "(empty)"}`);
  if (deployment?.trim() && selected !== mode.toLowerCase())
    throw new Error(`VITE_DEPLOY_ENV=${selected} conflicts with Vite mode ${mode}; use the matching --mode`);
  return selected as DeploymentEnvironment;
}

export function resolveRustWebSocketUrl(options: WebSocketEnvironment): string {
  const environment = resolveDeploymentEnvironment(options.mode, options.deployment);
  const page = new URL(options.pageUrl);

  // A production bundle viewed on localhost or staging must never reach live
  // profiles by accident. Use the correct staging build for preview testing.
  if (environment === "production" && page.hostname !== LIVE_PAGE_HOST)
    throw new Error(`Production multiplayer only connects from ${LIVE_PAGE_HOST}; use a staging build to preview`);

  let target = options.configuredUrl?.trim();
  if (!target && environment === "production") {
    target = LIVE_SOCKET;
  } else if (!target && environment === "development") {
    // Support local development from localhost and another device on the LAN.
    const local = new URL(page);
    local.protocol = page.protocol === "https:" ? "wss:" : "ws:";
    local.port = "9001";
    local.pathname = "/";
    local.search = "";
    local.hash = "";
    target = local.href;
  } else if (!target) {
    throw new Error(`VITE_RUST_WS_URL is required for ${environment}; never default to the live server`);
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error("VITE_RUST_WS_URL must be an absolute ws:// or wss:// URL");
  }
  if (!["ws:", "wss:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash)
    throw new Error("VITE_RUST_WS_URL must be a WebSocket URL without credentials, query or fragment");
  if (environment !== "production" && url.hostname === LIVE_API_HOST)
    throw new Error("Non-production Avensky builds cannot connect to the live multiplayer endpoint");
  if (environment === "production" && url.hostname !== LIVE_API_HOST)
    throw new Error("Production multiplayer must connect to api.avensky.com");
  if (environment === "production" && url.protocol !== "wss:")
    throw new Error("Production multiplayer requires wss://");
  if (page.protocol === "https:" && url.protocol !== "wss:")
    throw new Error("An HTTPS page requires a secure wss:// multiplayer connection");
  return url.href;
}
