import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { testerAccounts, totp } from "./accounts.mjs";
import { createPortal } from "./portal.mjs";

const origin = "https://staging.avensky.com";
const password = "a separate staging passphrase for QA";

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
  const signed = await post("enroll", { email: admin.email, invite: admin.code, password });
  const adminCookie = getCookie(signed);
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
});
