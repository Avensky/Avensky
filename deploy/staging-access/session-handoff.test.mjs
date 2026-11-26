import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { testerAccounts } from "./accounts.mjs";
import { gameBridge, gameSocketGate } from "./game-bridge.mjs";
import { createPortal } from "./portal.mjs";

const origin = "https://staging.avensky.com";
const binary = process.env.AVENSKY_TEST_GAME_BIN;

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

test("a verified second device can cancel or explicitly transfer the real game", {
  skip: !binary && "Set AVENSKY_TEST_GAME_BIN to a built staging-capable game server",
  timeout: 30_000,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "avensky-handoff-"));
  const key = randomBytes(32).toString("hex");
  const staging = join(dir, "staging");
  await mkdir(staging);
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const game = spawn(binary, [], {
    env: { ...process.env, AVENLAB_ENV: "staging", AVENLAB_PLAYER_ACCOUNTS: "1", AVENLAB_BIND: "127.0.0.1:" + port,
      AVENLAB_SOCIAL_PATH: join(staging, "social.json"), AVENLAB_STAGING_SIGN_IN_KEY: key },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const stopped = once(game, "exit");
  const sockets = [];
  let accounts, portal, gate;
  try {
    let ready = false;
    for await (const line of createInterface({ input: game.stdout })) {
      if (line.includes("WebSocket listening on")) { ready = true; break; }
    }
    assert.ok(ready, "game started on loopback");
    const bridge = gameBridge(key, `ws://127.0.0.1:${port}/__alpha_bridge`);
    assert.equal(await bridge.supportsSessionTakeover(), true);
    accounts = testerAccounts(join(staging, "social.sqlite3"), randomBytes(32), bridge);
    portal = createPortal({ origin, accounts, game: bridge });
    gate = gameSocketGate({ origin, accounts, key });
    const portalUrl = "http://127.0.0.1:" + await listen(portal);
    const gateUrl = "http://127.0.0.1:" + await listen(gate) + "/socket";
    const email = "handoff@example.test";
    const password = "isolated game handoff test";
    const post = (path, fields, cookie = "") => fetch(portalUrl + path, {
      method: "POST", headers: { origin, cookie }, body: new URLSearchParams(fields), redirect: "manual",
    });
    const verify = cookie => fetch(gateUrl, { headers: { origin, cookie } });
    async function connect(cookie) {
      // Forward exactly the admission headers that the reverse proxy receives.
      const admission = await verify(cookie);
      assert.equal(admission.status, 204);
      const headers = { Origin: origin };
      for (const [key, value] of admission.headers)
        if (key.startsWith("x-avensky-alpha-")) headers[key] = value;
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/`, { headers });
      sockets.push(socket);
      return socket;
    }
    async function waitForProfile(socket, profile) {
      while (true) {
        const [event] = await once(socket, "message", { signal: AbortSignal.timeout(4000) });
        const message = JSON.parse(event.data);
        if (message.type === "social_state") {
          assert.equal(message.data.profile.id, profile);
          return;
        }
      }
    }
    const { code } = accounts.issueInvite(email);
    const enrolled = await post("/__alpha/enroll", { email, password, invite: code });
    assert.equal(enrolled.status, 303);
    const cookieA = enrolled.headers.get("set-cookie").split(";")[0];
    const profile = accounts.viewer(cookieA.split("=")[1]).game_profile;
    const deviceA = await connect(cookieA);
    await waitForProfile(deviceA, profile);
    const failed = await post("/sign-in", { email, password: "incorrect" });
    assert.equal(failed.status, 400);
    assert.equal((await verify(cookieA)).status, 204);

    async function requestTransfer() {
      const prompt = await post("/sign-in", { email, password });
      assert.equal(prompt.status, 200);
      assert.equal(prompt.headers.get("set-cookie"), null);
      return (await prompt.text()).match(/name="handoff" value="([a-f0-9]{64})"/)[1];
    }
    const transfer = (handoff, decision) => post("/__alpha/sign-in/transfer", { handoff, decision });
    const cancelled = await requestTransfer();
    assert.equal((await transfer(cancelled, "cancel")).headers.get("location"), "/sign-in");
    assert.equal((await transfer(cancelled, "continue")).status, 409);
    const approved = await requestTransfer();
    assert.equal((await verify(cookieA)).status, 204);
    assert.equal(deviceA.readyState, WebSocket.OPEN);
    const displaced = once(deviceA, "close", { signal: AbortSignal.timeout(5000) });
    const results = await Promise.all([transfer(approved, "continue"), transfer(approved, "continue")]);
    assert.deepEqual(results.map(r => r.status).sort(), [303, 409]);
    const signedIn = results.find(r => r.status === 303);
    assert.equal(signedIn.status, 303);
    const cookieB = signedIn.headers.get("set-cookie").split(";")[0];
    assert.equal((await displaced)[0].code, 4001);
    assert.equal((await verify(cookieA)).status, 401);
    const deviceB = await connect(cookieB);
    await waitForProfile(deviceB, profile);
    const sameTab = await connect(cookieB);
    assert.equal((await once(sameTab, "close", { signal: AbortSignal.timeout(4000) }))[0].code, 4002);
    assert.equal((await post("/__alpha/sign-out", {}, cookieA)).status, 403);
    assert.equal((await verify(cookieB)).status, 204);
    assert.equal(deviceB.readyState, WebSocket.OPEN);
  } finally {
    for (const socket of sockets) socket.close();
    for (const server of [portal, gate]) {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
    }
    accounts?.close();
    game.kill();
    await stopped;
    await rm(dir, { recursive: true, force: true });
  }
});
