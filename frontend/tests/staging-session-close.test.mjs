import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test("terminal staging closes pause retries and leave the winning player's cookie alone", async t => {
  const dom = new JSDOM("", { url: "https://staging.avensky.com/", pretendToBeVisual: true });
  const sockets = [], verifications = [], formRequests = [];
  class Socket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 0;
    bufferedAmount = 0;
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen?.(); }
    close(code = 1000) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.onclose?.({ code });
    }
    receive(packet) { this.onmessage?.({ data: JSON.stringify(packet) }); }
    send() {}
  }
  const originals = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent,
    WebSocket: Socket, fetch: () => new Promise(resolve => verifications.push(resolve)),
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const vite = await createServer({
    mode: process.env.VITE_DEPLOY_ENV || "development",
    define: {
      "import.meta.env.MODE": JSON.stringify("staging"),
      "import.meta.env.VITE_DEPLOY_ENV": JSON.stringify("staging"),
      "import.meta.env.VITE_RUST_WS_URL": JSON.stringify("wss://staging.avensky.com/ws/"),
    },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error",
  });
  let transport;
  try {
    transport = await vite.ssrLoadModule("/src/net/rustSocket.ts");
    const { useSocialStore: social } = await vite.ssrLoadModule("/src/store/social/socialStore.ts");
    const { useUIStore: ui } = await vite.ssrLoadModule("/src/store/menus/uiStore.ts");
    window.avenskyPortalNavigation = { async showSignIn(...args) { formRequests.push(args); } };
    t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const stayPaused = () => {
      const count = sockets.length;
      window.dispatchEvent(new window.Event("focus"));
      document.dispatchEvent(new window.Event("visibilitychange"));
      t.mock.timers.tick(30_000);
      assert.equal(sockets.length, count, "no foreground, watchdog or timer retry");
    };
    const first = transport.connectRustServer();
    first.close(4002);
    assert.equal(social.getState().entryIssue?.kind, "other-tab");
    assert.equal(ui.getState().screen, "welcome");
    assert.deepEqual(formRequests, [], "a duplicate tab keeps its shared cookie");
    stayPaused();

    transport.retryEntryConnection();
    const active = sockets.at(-1);
    active.open();
    active.receive({ type: "welcome", player_id: "first", server_id: "stage", social_version: 1, staging_sign_in: true });
    active.receive({ type: "social_state", data: { profile: { id: "one", name: "Player" },
      limits: { max_active_worlds: 1 }, players: [], teammates: [], requests: [], groups: [], worlds: [], world_invites: [], maps: [] } });
    active.receive({ type: "social_error", message: "The invitation has expired." });
    assert.equal(social.getState().entryIssue, null, "an in-game social error leaves the transport alone");
    active.close(1006);
    transport.connectRustServer().open();
    sockets.at(-1).receive({ type: "welcome", player_id: "second" });
    verifications.shift()({ status: 401 });
    await Promise.resolve();
    assert.deepEqual(formRequests, [], "late verification cannot interrupt a newer healthy socket");
    sockets.at(-1).close(4001);
    assert.match(formRequests[0][1], /another device/);
    assert.equal(formRequests[0][0], false);
    stayPaused();
    await new Promise(resolve => setImmediate(resolve));

    transport.connectRustServer().close(1006);
    verifications.shift()({ status: 401 });
    await Promise.resolve();
    assert.match(formRequests[1][1], /Your session ended/);
    assert.equal(formRequests[1][0], false);
    stayPaused();
    await new Promise(resolve => setImmediate(resolve));
    transport.connectRustServer().close(4003);
    assert.deepEqual(formRequests[2], formRequests[1], "explicit revocation and confirmed HTTP expiry use the same public form");
    stayPaused();
  } finally {
    transport?.disconnectRustServer();
    t.mock.timers.reset();
    await vite.close();
    dom.window.close();
    for (const [key, previous] of originals) {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    }
  }
});
