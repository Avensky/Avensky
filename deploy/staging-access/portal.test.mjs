import assert from "node:assert/strict";
import { once } from "node:events";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { testerAccounts, totp } from "./accounts.mjs";
import { createPortal } from "./portal.mjs";
import { gameSocketGate } from "./game-bridge.mjs";

const origin = "https://staging.avensky.com";
const password = "a separate staging passphrase for QA";
const newPassword = "a new separate staging passphrase for QA";

test("invites grant access once and revocation invalidates existing cookies", async t => {
  const accounts = testerAccounts(":memory:", randomBytes(32));
  const delivered = [];
  const server = createPortal({ origin, accounts, mailInvite: async (...message) => delivered.push(message) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { await new Promise(resolve => server.close(resolve)); accounts.close(); });
  const url = `http://127.0.0.1:${server.address().port}/__alpha/`;
  const get = (path, headers) => fetch(url + path, { headers, redirect: "manual" });
  const post = (path, fields, cookie, from = origin) => fetch(url + path, {
    method: "POST", body: new URLSearchParams(fields), redirect: "manual",
    headers: { origin: from, ...(cookie ? { cookie } : {}) },
  });
  const getCookie = response => {
    const value = response.headers.get("set-cookie");
    assert.match(value, /^__Host-avensky-alpha=[a-f\d]{64};.*HttpOnly; Secure; SameSite=Lax$/);
    return value.split(";")[0];
  };

  assert.equal((await get("verify", { "x-forwarded-uri": "/__staging-assets/verified/car.glb" })).status, 401);
  const redirect = await get("verify", { "x-forwarded-uri": "/", accept: "text/html" });
  assert.equal(redirect.headers.get("location"), "/__alpha/sign-in");
  assert.equal((await get("testers")).status, 403);
  const admin = accounts.issueInvite("operator@example.net", true);
  const enrollment = { email: admin.email, invite: admin.code, password };
  assert.equal((await get("enroll")).headers.get("referrer-policy"), "same-origin");
  const blocked = await post("enroll", enrollment, undefined, "null");
  assert.equal(blocked.status, 403);
  assert.match(await blocked.text(), /Open the portal or your original invitation link/);
  const signed = await post("enroll", enrollment);
  assert.equal(signed.status, 303);
  assert.equal(signed.headers.get("location"), "/__alpha/account");
  const adminCookie = getCookie(signed);
  assert.match(await (await get("account", { cookie: adminCookie })).text(), /Alpha testers/);
  assert.equal((await post("testers/invite", { email: "player@example.net" }, adminCookie, "https://example.org")).status, 403);
  assert.equal((await post("testers/invite", { email: "PLAYER@example.net" }, adminCookie)).status, 200);
  assert.equal(delivered[0][0], "player@example.net");
  const invite = new URL(delivered[0][1]).hash.slice(1);
  assert.equal((await post("enroll", { email: "else@example.net", invite, password })).status, 400);
  const player = getCookie(await post("enroll", { email: "player@example.net", invite, password }));
  assert.equal((await post("enroll", { email: "player@example.net", invite, password })).status, 400);
  assert.equal((await get("verify", { cookie: player })).status, 204);
  assert.equal((await get("testers", { cookie: player })).status, 403);
  assert.equal((await post("testers/revoke", { email: "player@example.net" }, adminCookie)).status, 303);
  assert.equal((await get("verify", { cookie: player })).status, 401);
  assert.equal((await post("sign-in", { email: "player@example.net", password })).status, 400);
  assert.equal((await post("testers/restore", { email: "player@example.net" }, adminCookie)).status, 303);
  assert.equal((await post("sign-in", { email: "player@example.net", password })).status, 303);
});

test("authenticator enrollment requires the password and recovery codes are one-use", async t => {
  assert.equal(totp(Buffer.from("12345678901234567890"), 1), "287082");
  const accounts = testerAccounts(":memory:", randomBytes(32));
  t.after(() => accounts.close());
  const invite = accounts.issueInvite("mfa@example.net");
  const value = await accounts.enroll(invite.email, invite.code, password);
  const secondDevice = await accounts.logIn(invite.email, password, "");
  const viewer = accounts.viewer(value);
  await assert.rejects(accounts.beginMfa(viewer, "a different passphrase"));
  const encoded = await accounts.beginMfa(viewer, password);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...encoded].map(letter => alphabet.indexOf(letter).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const code = totp(key, Math.floor(Date.now() / 30000));
  const codes = accounts.enableMfa(viewer, code);
  assert.equal(codes.length, 8);
  assert.equal(accounts.viewer(secondDevice), undefined);
  await assert.rejects(accounts.logIn(invite.email, password, ""));
  await assert.rejects(accounts.logIn(invite.email, password, code));
  assert.equal(accounts.viewer(await accounts.logIn(invite.email, password, codes[0])).has_mfa, 1);
  await assert.rejects(accounts.logIn(invite.email, password, codes[0]));
  const reset = accounts.issuePasswordReset(invite.email);
  await assert.rejects(accounts.resetPassword(reset.email, reset.code, newPassword, ""));
  await accounts.resetPassword(reset.email, reset.code, newPassword, codes[1]);
  await assert.rejects(accounts.logIn(invite.email, newPassword, ""));
  assert.equal(accounts.viewer(await accounts.logIn(invite.email, newPassword, codes[2])).has_mfa, 1);
});

test("a reset link replaces the admin password once and invalidates old sessions", async t => {
  const accounts = testerAccounts(":memory:", randomBytes(32));
  const server = createPortal({ origin, accounts });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { await new Promise(resolve => server.close(resolve)); accounts.close(); });

  const admin = accounts.issueInvite("operator@example.net", true);
  const session = await accounts.enroll(admin.email, admin.code, password);
  assert.throws(() => accounts.issuePasswordReset("unknown@example.net"));
  const oldReset = accounts.issuePasswordReset(admin.email);
  const reset = accounts.issuePasswordReset(admin.email);
  const url = `http://127.0.0.1:${server.address().port}/__alpha/reset`;
  const page = await fetch(url);
  assert.equal(page.headers.get("referrer-policy"), "same-origin");
  assert.match(await page.text(), /Set new password/);
  const post = (email, code) => fetch(url, {
    method: "POST", redirect: "manual", headers: { origin },
    body: new URLSearchParams({ email, reset: code, password: newPassword }),
  });
  assert.equal((await post(admin.email, oldReset.code)).status, 400);
  assert.equal((await post("unknown@example.net", reset.code)).status, 400);
  const changed = await post(admin.email, reset.code);
  assert.equal(changed.status, 303);
  assert.equal(changed.headers.get("location"), "/__alpha/sign-in");
  assert.equal((await post(admin.email, reset.code)).status, 400);
  assert.equal(accounts.viewer(session), undefined);
  await assert.rejects(accounts.logIn(admin.email, password, ""));
  const viewer = accounts.viewer(await accounts.logIn(admin.email, newPassword, ""));
  assert.equal(viewer.email, admin.email);
  assert.equal(viewer.admin, 1);
});

test("single sign-in links existing game identities and gates sockets and assets", async t => {
  const key = randomBytes(32).toString("hex");
  const adminId = "a".repeat(32);
  const testerId = "b".repeat(32);
  const calls = [];
  const game = {
    async authenticate(login, attemptedPassword, name, deviceToken) {
      calls.push([login, name, deviceToken]);
      if (attemptedPassword !== password) throw Error("Wrong game password.");
      if (login === "old_racer") return adminId;
      if (login === "tester@example.net" && deviceToken === "c".repeat(64)) return testerId;
      throw Error("Unknown game account.");
    },
    async disconnect(profile) { calls.push(profile); },
  };
  const accounts = testerAccounts(":memory:", randomBytes(32), game);
  const portal = createPortal({ origin, accounts, game });
  const gate = gameSocketGate({ origin, accounts, key });
  async function address(server) {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return `http://127.0.0.1:${server.address().port}`;
  }
  const url = (await address(portal)) + "/__alpha/";
  const socket = (await address(gate)) + "/socket";
  t.after(async () => {
    await Promise.all([portal, gate].map(server => new Promise(resolve => server.close(resolve))));
    accounts.close();
  });
  const post = (path, fields, cookie) => fetch(url + path, {
    method: "POST", redirect: "manual", headers: { origin, ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(fields),
  });
  assert.equal((await fetch(socket, { headers: { origin } })).status, 401);
  assert.equal((await post("enroll", { email: "unknown@example.net", intent: "new", invite: "1".repeat(64), password })).status, 400);
  assert.equal(calls.length, 0);

  const admin = accounts.issueInvite("admin@example.net", true);
  const enrollment = { email: admin.email, intent: "existing", login: "old_racer", invite: admin.code };
  assert.equal((await post("enroll", { ...enrollment, password: "a wrong game password" })).status, 400);
  const linked = await post("enroll", { ...enrollment, password });
  assert.equal(linked.status, 303);
  assert.equal(linked.headers.get("location"), "/");
  const adminCookie = linked.headers.get("set-cookie").split(";")[0];
  const reauth = await post("sign-in", { email: admin.email, password });
  assert.equal(reauth.status, 303);

  const manual = await post("testers/invite", { email: "tester@example.net" }, adminCookie);
  assert.equal(manual.status, 200);
  const [, invite] = (await manual.text()).match(/enroll#([a-f\d]{64})/);
  const tester = await post("enroll", {
    email: "tester@example.net", invite, intent: "device", deviceToken: "c".repeat(64), password,
  });
  assert.equal(tester.status, 303);
  const cookie = tester.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(socket, { headers: { origin: "https://other.example", cookie } })).status, 403);
  const allowed = await fetch(socket, { headers: { origin, cookie } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("x-avensky-alpha-bridge"), null);
  assert.equal(allowed.headers.get("x-avensky-alpha-profile"), testerId);
  const signed = `avensky-staging-ws:${testerId}:${allowed.headers.get("x-avensky-alpha-issued")}:${allowed.headers.get("x-avensky-alpha-expires")}`;
  assert.equal(allowed.headers.get("x-avensky-alpha-proof"), createHmac("sha256", key).update(signed).digest("hex"));
  const assets = await fetch(url + "verify", { headers: { cookie, "x-forwarded-uri": "/__staging-assets/release/car.glb" } });
  assert.equal(assets.status, 204);
  assert.equal(assets.headers.get("x-avensky-alpha-proof"), null);

  assert.equal((await post("testers/revoke", { email: "tester@example.net" }, adminCookie)).status, 303);
  assert.equal(calls.at(-1), testerId);
  assert.equal((await fetch(socket, { headers: { origin, cookie } })).status, 401);
  assert.equal((await fetch(url + "verify", { headers: { cookie } })).status, 401);
});
