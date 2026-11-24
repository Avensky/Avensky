import { createServer } from "node:http";
import { createHmac } from "node:crypto";

export function gameBridge(key, url = "ws://127.0.0.1:9002/__alpha_bridge") {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw Error("Set the staging game sign-in key.");
  function request(action, fields = {}) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { headers: { "X-Avensky-Alpha-Bridge": key } });
      const timeout = setTimeout(() => fail("The staging game did not respond. Try again."), 9000);
      function fail(message) {
        clearTimeout(timeout);
        socket.close();
        reject(Error(message));
      }
      socket.addEventListener("open", () => socket.send(JSON.stringify({ action, ...fields })), { once: true });
      socket.addEventListener("error", () => fail("Could not connect to staging game sign-in."), { once: true });
      socket.addEventListener("close", () => fail("The staging game closed the sign-in request."), { once: true });
      socket.addEventListener("message", ({ data }) => {
        clearTimeout(timeout);
        socket.close();
        try {
          const result = JSON.parse(data);
          if (result.ok === true) resolve(result.data ?? {});
          else reject(Error(result.message || "The game account did not accept the request."));
        } catch {
          reject(Error("The staging game returned an invalid sign-in reply."));
        }
      }, { once: true });
    });
  }
  return {
    async authenticate(login, password, name, device_token) {
      const result = await request(name === undefined ? "check" : "register", { login, password, name, device_token });
      if (!/^[a-f0-9]{32}$/i.test(result.profile_id ?? "")) throw Error("The game profile is unavailable.");
      return result.profile_id;
    },
    async serverId() {
      const { server_id } = await request("metadata");
      if (!/^[a-f0-9]{32}$/i.test(server_id ?? "")) throw Error("The staging game server is unavailable.");
      return server_id;
    },
    disconnect: profile_id => request("disconnect", { profile_id }),
  };
}

// Caddy only uses this listener for its internal WebSocket admission check.
// The public portal listener never responds with bridge credentials.
export function gameSocketGate({ accounts, key, origin }) {
  return createServer({ requestTimeout: 5000, headersTimeout: 5000 }, (req, res) => {
    if (req.method !== "GET" || req.url !== "/socket" || req.headers.origin !== origin) {
      res.writeHead(403).end();
      return;
    }
    const cookie = sessionCookie(req);
    let viewer;
    try { viewer = accounts.viewer(cookie); }
    catch { res.writeHead(503).end(); return; }
    if (!viewer?.game_profile) { res.writeHead(401).end(); return; }
    const issued = Date.now();
    const proof = createHmac("sha256", key)
      .update(`avensky-staging-ws:${viewer.game_profile}:${issued}:${viewer.expires}`).digest("hex");
    res.writeHead(204, {
      "X-Avensky-Alpha-Profile": viewer.game_profile,
      "X-Avensky-Alpha-Expires": String(viewer.expires),
      "X-Avensky-Alpha-Issued": String(issued),
      "X-Avensky-Alpha-Proof": proof,
      "Cache-Control": "no-store",
    }).end();
  });
}

export const cookieName = "__Host-avensky-alpha";
export function sessionCookie(req) {
  const cookie = req.headers.cookie?.split(";").map(row => row.trim()).find(row => row.startsWith(cookieName + "="));
  return cookie?.slice(cookieName.length + 1) ?? "";
}
