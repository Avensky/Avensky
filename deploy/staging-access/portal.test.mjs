import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { checkSharedDatabase, consolidateAccess } from "./shared-database.mjs";
import { createHash, createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { testerAccounts, totp } from "./accounts.mjs";
import palettes from "../../frontend/src/theme/palettes.json" with { type: "json" };
import { DEFAULT_GARAGE_THEME } from "../../frontend/src/theme/garageEntry.ts";
import { createPortal } from "./portal.mjs";
import { gameSocketGate, LOGIN_FAILED } from "./game-bridge.mjs";

const origin = "https://staging.avensky.com";
const password = "a separate staging passphrase for QA";
const newPassword = "a new separate staging passphrase for QA";

async function handoffProof(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  const html = await response.text();
  assert.match(html, /Sign out other device and continue/);
  assert.match(html, /data-portal-cancel/);
  assert.doesNotMatch(html, /name="password"|name="email"/);
  return html.match(/name="handoff" value="([a-f0-9]{64})"/)[1];
}

test("the installed standalone sign-in uses the palette shipped with the app", async t => {
  const dir = await mkdtemp(join(tmpdir(), "avensky-portal-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of ["accounts.mjs", "shared-database.mjs", "game-bridge.mjs", "portal.mjs"]) {
    await copyFile(new URL(name, import.meta.url), join(dir, name));
  }
  await copyFile(new URL("../../frontend/src/theme/palettes.json", import.meta.url), join(dir, "palettes.json"));
  for (const name of ["garageEntry.ts", "branding.ts"]) {
    await copyFile(new URL("../../frontend/src/theme/" + name, import.meta.url), join(dir, name));
  }
  const installed = await import(pathToFileURL(join(dir, "portal.mjs")).href);
  const accounts = testerAccounts(":memory:", randomBytes(32));
  const server = installed.createPortal({ origin, accounts });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}/__alpha/`;
    const theme = await fetch(url + "theme.js");
    assert.equal(theme.status, 200);
    const page = await (await fetch(url + "sign-in")).text();
    assert.match(page, /<script src="\/__alpha\/theme\.js"><\/script>/);
    assert.match(page, /--app-accent:#[a-f0-9]{6}/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    accounts.close();
  }
});

test("signed-out requests can load only the garage entry graph and its exact released GLB", async t => {
  const dir = await mkdtemp(join(tmpdir(), "garage-entry-"));
  const garageManifest = join(dir, "garage-runtime.json");
  const entry = "/assets/garageRoomElement-test.js";
  const model = "/__staging-assets/" + "f".repeat(64) + "/models/world/garage_special.glb";
  await writeFile(garageManifest, JSON.stringify({ entry, modules: [entry, "/assets/three-test.js"], model }));
  const accounts = testerAccounts(":memory:", randomBytes(32));
  const server = createPortal({ origin, accounts, garageManifest });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { await new Promise(resolve => server.close(resolve)); accounts.close(); await rm(dir, { recursive: true }); });
  const base = "http://127.0.0.1:" + server.address().port + "/__alpha/";
  const bootstrap = await fetch(base + "entry/garage-room.js", { redirect: "manual" });
  assert.equal(bootstrap.headers.get("location"), entry);
  for (const path of [entry, "/assets/three-test.js", model, "/draco/draco_decoder.wasm"]) {
    const access = await fetch(base + "verify", { headers: { "x-forwarded-uri": path } });
    assert.equal(access.status, 204, path);
  }
  for (const path of ["/assets/index-private.js", model.replace("garage_special", "hero"), model + "/other", "/ws/"]) {
    const access = await fetch(base + "verify", { headers: { "x-forwarded-uri": path } });
    assert.equal(access.status, 401, path);
  }
});

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
  assert.equal(redirect.headers.get("location"), "/sign-in");
  const oldBookmark = await get("sign-in");
  assert.equal(oldBookmark.status, 303);
  assert.equal(oldBookmark.headers.get("location"), "/sign-in");
  const entry = await fetch(new URL("/sign-in", url), { redirect: "manual" });
  assert.equal(entry.status, 200);
  const signIn = await entry.text();
  assert.match(signIn, /name="viewport" content="[^"]*viewport-fit=cover/);
  assert.match(signIn, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(signIn, /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(signIn, /<form method="post" action="\/sign-in"/);
  assert.match(signIn, /id="alpha-password" type="password" name="password"/);
  assert.match(signIn, /<button type="button"[^>]+aria-controls="alpha-password" hidden>Show password/);
  assert.match(signIn, /<script src="\/__alpha\/password\.js" defer><\/script>/);
  assert.doesNotMatch(signIn, /name="code"|<video|<canvas|flare\.js|Play as guest|Vehicle/);
  const brand = signIn.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)[1];
  assert.match(brand, /src="\/__alpha\/entry\/logo\.svg"/);
  assert.equal(brand.replace(/<[^>]+>/g, "").trim(), "Avensky");
  assert.doesNotMatch(brand, /<(?:input|button|a|nav)\b|tabindex/);
  assert.match(signIn, /src="\/__alpha\/entry\/sign-in-input\.js"/);
  assert.equal((await get("entry/sign-in-input.js")).status, 200);
  assert.doesNotMatch(signIn, /garage-entry-sign/);
  assert.match(signIn, /data-live-garage/);
  assert.match(signIn, /type="module" src="\/__alpha\/entry\/garage-room\.js"/);
  const css = await get("entry/garage-entry.css");
  assert.equal(css.status, 200);
  assert.doesNotMatch(signIn, /<picture|garage-entry[^"]*\.webp/);
  assert.equal((await get("entry/sign-in-navigation.js")).status, 200);
  assert.equal((await get("entry/game-bridge.mjs")).status, 404);
  const script = await get("password.js");
  assert.match(script.headers.get("content-type"), /^text\/javascript/);
  const input = { type: "password", value: password };
  const handlers = {};
  const toggle = {
    hidden: true,
    textContent: "Show password",
    getAttribute: name => name === "aria-controls" && "alpha-password",
    addEventListener: (event, callback) => { handlers[event] = callback; },
  };
  runInNewContext(await script.text(), {
    document: {
      querySelector: selector => selector === ".password-toggle" && toggle,
      querySelectorAll: selector => selector === ".password-toggle" ? [toggle] : [],
      getElementById: id => id === "alpha-password" && input,
    },
    window: { addEventListener: (event, callback) => { handlers[event] = callback; } },
  });
  assert.equal(toggle.hidden, false);
  handlers.click();
  assert.equal(input.type, "text");
  assert.equal(toggle.textContent, "Hide password");
  handlers.click();
  assert.equal(input.type, "password");
  assert.equal(toggle.textContent, "Show password");
  handlers.click();
  handlers.pageshow();
  assert.equal(input.type, "password");
  assert.equal(input.value, password);
  assert.equal((await get("testers")).status, 403);
  assert.equal((await get("session")).status, 401);
  assert.match(signIn, /Sign in/);
  assert.doesNotMatch(signIn, /Enter staging|Log out/);
  const theme = await get("theme.js");
  assert.equal(theme.status, 200);
  const set = new Map();
  const root = { dataset: {}, style: { setProperty: (key, value) => set.set(key, value) } };
  const paletteSource = await theme.text();
  runInNewContext(paletteSource, { localStorage: { getItem: () => null }, document: { documentElement: root } });
  assert.equal(root.dataset.uiTheme, DEFAULT_GARAGE_THEME);
  assert.equal(set.get("--app-garage-panel"), palettes[DEFAULT_GARAGE_THEME]["garage-panel"]);
  runInNewContext(paletteSource, {
    localStorage: { getItem: key => key === "avenlab-preferences-v1" ? JSON.stringify({ state: { theme: "deep-purple", garageEffects: { theme: "forest" } } }) : null },
    document: { documentElement: root },
  });
  assert.equal(root.dataset.uiTheme, "deep-purple");
  assert.equal(set.get("--app-accent"), "#a3adff");
  assert.equal(set.get("--app-garage-panel"), "#6e886f");
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
  const accountPage = await (await get("account", { cookie: adminCookie })).text();
  assert.match(accountPage, /Alpha testers/);
  assert.match(accountPage, /Continue to game/);
  assert.match(accountPage, /Log out/);
  assert.doesNotMatch(accountPage, /Enter staging/);
  assert.equal((await get("sign-in", { cookie: adminCookie })).headers.get("location"), "/");
  assert.deepEqual(await (await get("session", { cookie: adminCookie })).json(),
    { email: "operator@example.net", admin: true, hasMfa: false });
  assert.equal((await post("testers/invite", { email: "player@example.net" }, adminCookie, "https://example.org")).status, 403);
  assert.equal((await post("testers/invite", { email: "PLAYER@example.net" }, adminCookie)).status, 200);
  assert.equal(delivered[0][0], "player@example.net");
  const invite = new URL(delivered[0][1]).hash.slice(1);
  assert.equal((await post("enroll", { email: "else@example.net", invite, password })).status, 400);
  const player = getCookie(await post("enroll", { email: "player@example.net", invite, password }));
  assert.deepEqual(await (await get("session", { cookie: player })).json(),
    { email: "player@example.net", admin: false, hasMfa: false });
  const inviteJson = (cookie, email) => fetch(url + "testers/invite", {
    method: "POST", headers: { origin, accept: "application/json", "x-alpha-client": "alpha-account-tests", ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams({ email }),
  });
  assert.equal((await inviteJson(undefined, "anon@example.net")).status, 401);
  assert.equal((await inviteJson(player, "guestinvite@example.net")).status, 403);
  assert.deepEqual(await (await inviteJson(adminCookie, "jsoninvite@example.net")).json(),
    { email: "jsoninvite@example.net", sent: true });
  const request = (endpoint, fields, cookie = player) => fetch(url + endpoint, {
    method: "POST", headers: { origin, cookie, accept: "application/json", "x-alpha-client": "alpha-account-tests" },
    body: new URLSearchParams(fields),
  });
  assert.equal((await request("account/delete-request", {
    confirmEmail: "player@example.net", password: "wrong",
  })).status, 400);
  const emailChange = await request("account/email-request", { newEmail: "new-player@example.net", password });
  assert.equal(emailChange.status, 200);
  assert.match((await emailChange.json()).message, /remains active/);
  const deletion = await request("account/delete-request", { confirmEmail: "player@example.net", password });
  assert.equal(deletion.status, 200);
  assert.match((await deletion.json()).message, /Nothing has been deleted/);
  assert.equal(accounts.viewer(player.split("=")[1]).email, "player@example.net");
  const pending = accounts.list();
  assert.equal(pending.emailChanges[0].new_email, "new-player@example.net");
  assert.equal(pending.deletionRequests[0].email, "player@example.net");
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
  const server = createPortal({ origin, accounts });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { await new Promise(resolve => server.close(resolve)); accounts.close(); });
  const url = `http://127.0.0.1:${server.address().port}/__alpha/`;
  const post = (path, fields) => fetch(url + path, {
    method: "POST", redirect: "manual", headers: { origin }, body: new URLSearchParams(fields),
  });
  const invite = accounts.issueInvite("mfa@example.net");
  const value = await accounts.enroll(invite.email, invite.code, password);
  const beforeMfa = await accounts.beginSignIn(invite.email, password);
  const secondDevice = accounts.resolveHandoff(beforeMfa.handoff, true);
  assert.equal(accounts.viewer(value), undefined);
  const viewer = accounts.viewer(secondDevice);
  await assert.rejects(accounts.beginMfa(viewer, "a different passphrase"));
  const encoded = await accounts.beginMfa(viewer, password);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...encoded].map(letter => alphabet.indexOf(letter).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const code = totp(key, Math.floor(Date.now() / 30000));
  const codes = accounts.enableMfa(viewer, code);
  assert.equal(codes.length, 8);
  assert.equal(accounts.viewer(secondDevice).email, invite.email);
  const badPassword = await post("sign-in", { email: invite.email, password: "a different passphrase" });
  assert.equal(badPassword.status, 400);
  assert.doesNotMatch(await badPassword.text(), /name="code"|name="challenge"/);
  const verifiedPassword = await post("sign-in", { email: invite.email, password });
  assert.equal(verifiedPassword.status, 200);
  assert.equal(verifiedPassword.headers.get("set-cookie"), null);
  const factor = await verifiedPassword.text();
  assert.match(factor, /Authenticator or recovery code/);
  assert.doesNotMatch(factor, /name="password"|name="email"/);
  const [, challenge] = factor.match(/name="challenge" value="([a-f0-9]{64})"/);
  assert.equal((await fetch(url + "verify", { headers: { cookie: `__Host-avensky-alpha=${challenge}` } })).status, 401);
  const rejected = await post("sign-in/code", { challenge, code });
  assert.equal(rejected.status, 400);
  assert.match(await rejected.text(), /The authentication code is incorrect/);
  assert.equal(accounts.viewer(secondDevice).email, invite.email);
  const handoff = await handoffProof(await post("../sign-in", { challenge, code: codes[0] }));
  assert.equal(accounts.viewer(secondDevice).email, invite.email);
  assert.equal(accounts.viewer(handoff), undefined);
  const completed = await post("sign-in/transfer", { handoff, decision: "continue" });
  assert.equal(accounts.viewer(secondDevice), undefined);
  assert.equal(completed.status, 303);
  const cookie = completed.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(url + "verify", { headers: { cookie } })).status, 204);
  assert.equal((await post("sign-in/code", { challenge, code: codes[0] })).status, 400);
  let pending = await accounts.beginSignIn(invite.email, password);
  for (let i = 0; i < 4; i++) assert.deepEqual(accounts.completeSignIn(pending.challenge, codes[0]), pending);
  pending = await accounts.beginSignIn(invite.email, password);
  assert.deepEqual(accounts.completeSignIn(pending.challenge, codes[0]), { locked: true });
  assert.deepEqual(await accounts.beginSignIn(invite.email, password), { locked: true });
  const reset = await accounts.issuePasswordReset(invite.email);
  await assert.rejects(accounts.resetPassword(reset.email, reset.code, newPassword, ""));
  await accounts.resetPassword(reset.email, reset.code, newPassword, codes[1]);
  assert.deepEqual(accounts.completeSignIn(pending.challenge, codes[2]), {});
  const afterReset = await accounts.beginSignIn(invite.email, newPassword);
  assert.equal(accounts.viewer(accounts.completeSignIn(afterReset.challenge, codes[2]).session).has_mfa, 1);
});

test("a reset link replaces the admin password once and invalidates old sessions", async t => {
  const accounts = testerAccounts(":memory:", randomBytes(32));
  const server = createPortal({ origin, accounts });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { await new Promise(resolve => server.close(resolve)); accounts.close(); });

  const admin = accounts.issueInvite("operator@example.net", true);
  const session = await accounts.enroll(admin.email, admin.code, password);
  await assert.rejects(accounts.issuePasswordReset("unknown@example.net"));
  const oldReset = await accounts.issuePasswordReset(admin.email);
  const reset = await accounts.issuePasswordReset(admin.email);
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
  assert.equal(changed.headers.get("location"), "/sign-in");
  assert.equal((await post(admin.email, reset.code)).status, 400);
  assert.equal(accounts.viewer(session), undefined);
  await assert.rejects(accounts.beginSignIn(admin.email, password));
  const viewer = accounts.viewer((await accounts.beginSignIn(admin.email, newPassword)).session);
  assert.equal(viewer.email, admin.email);
  assert.equal(viewer.admin, 1);
});

test("one invitation form signs in by email and gates sockets and assets", async t => {
  const key = randomBytes(32).toString("hex");
  const adminId = "a".repeat(32);
  const testerId = "b".repeat(32);
  const calls = [];
  const game = {
    async authenticate(login, attemptedPassword) {
      calls.push(["check", login]);
      if (attemptedPassword !== password) throw Error(LOGIN_FAILED);
      if (login === "admin@example.net") return adminId;
      if (login === "tester@example.net") return testerId;
      throw Error("Unknown game account.");
    },
    async enroll(email, attemptedPassword, deviceToken) {
      calls.push(["join", email, deviceToken]);
      if (attemptedPassword !== password) throw Error("Wrong game password.");
      if (email === "admin@example.net") return adminId;
      if (email === "tester@example.net" && deviceToken === "c".repeat(64)) return testerId;
      throw Error("Unknown game account.");
    },
    async sessionChanged(profile, digest) { calls.push(["session_changed", profile, digest]); },
    async disconnect(profile, digest) { calls.push(["disconnect", profile, digest]); },
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
  assert.equal((await post("enroll", { email: "unknown@example.net", invite: "1".repeat(64), password })).status, 400);
  assert.equal(calls.length, 0);

  const admin = accounts.issueInvite("admin@example.net", true);
  const enrollment = { email: admin.email, invite: admin.code };
  const enrollPage = await (await fetch(url + "enroll")).text();
  assert.doesNotMatch(enrollPage, /name="intent"|name="login"|Link an existing account/);
  assert.match(enrollPage, /garage-entry-scene/);
  assert.doesNotMatch(enrollPage, /<video|flare\.js/);
  assert.equal((await post("enroll", { ...enrollment, password: "a wrong game password" })).status, 400);
  const linked = await post("enroll", { ...enrollment, password });
  assert.equal(linked.status, 303);
  assert.equal(linked.headers.get("location"), "/");
  const enrolledCookie = linked.headers.get("set-cookie").split(";")[0];
  const entry = new URL("/sign-in", url);
  const restored = await fetch(entry, { headers: { cookie: enrolledCookie }, redirect: "manual" });
  assert.equal(restored.status, 303);
  assert.equal(restored.headers.get("location"), "/");
  const wrongPassword = await post("../sign-in", { email: admin.email, password: "a wrong game password" });
  const unknownEmail = await post("../sign-in", { email: "unknown@example.net", password });
  assert.equal(wrongPassword.status, 400);
  assert.equal(unknownEmail.status, 400);
  assert.equal(await wrongPassword.text(), await unknownEmail.text());
  assert.equal(calls.filter(call => call[0] === "session_changed").length, 1);
  assert.equal((await fetch(socket, { headers: { origin, cookie: enrolledCookie } })).status, 204);
  const handoff = await handoffProof(await post("../sign-in", { email: admin.email, password }));
  assert.equal(calls.filter(call => call[0] === "session_changed").length, 1);
  const reauth = await post("sign-in/transfer", { handoff, decision: "continue" });
  assert.equal(reauth.status, 303);
  const adminCookie = reauth.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(socket, { headers: { origin, cookie: enrolledCookie } })).status, 401);
  assert.equal((await fetch(url + "session", { headers: { cookie: enrolledCookie } })).status, 401);
  assert.equal((await post("sign-out", {}, enrolledCookie)).status, 403);
  assert.equal((await fetch(socket, { headers: { origin, cookie: adminCookie } })).status, 204);
  assert.equal(calls.filter(call => call[0] === "session_changed").length, 2);
  assert.equal(calls.filter(call => call[0] === "disconnect").length, 0);

  const manual = await post("testers/invite", { email: "tester@example.net" }, adminCookie);
  assert.equal(manual.status, 200);
  const [, invite] = (await manual.text()).match(/enroll#([a-f\d]{64})/);
  const tester = await post("enroll", {
    email: "tester@example.net", invite, deviceToken: "c".repeat(64), password,
  });
  assert.equal(tester.status, 303);
  const cookie = tester.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(socket, { headers: { origin: "https://other.example", cookie } })).status, 403);
  const allowed = await fetch(socket, { headers: { origin, cookie } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("x-avensky-alpha-bridge"), null);
  assert.equal(allowed.headers.get("x-avensky-alpha-profile"), testerId);
  const digest = createHash("sha256").update(cookie.split("=")[1]).digest("hex");
  assert.deepEqual(calls.at(-1), ["session_changed", testerId, digest]);
  const signed = `avensky-staging-ws:${testerId}:${allowed.headers.get("x-avensky-alpha-issued")}:${allowed.headers.get("x-avensky-alpha-expires")}:${digest}`;
  assert.equal(allowed.headers.get("x-avensky-alpha-proof"), `${digest}.${createHmac("sha256", key).update(signed).digest("hex")}`);
  const assets = await fetch(url + "verify", { headers: { cookie, "x-forwarded-uri": "/__staging-assets/release/car.glb" } });
  assert.equal(assets.status, 204);
  assert.equal(assets.headers.get("x-avensky-alpha-proof"), null);

  assert.equal((await post("testers/revoke", { email: "tester@example.net" }, adminCookie)).status, 303);
  assert.deepEqual(calls.at(-1), ["disconnect", testerId, undefined]);
  assert.equal((await fetch(socket, { headers: { origin, cookie } })).status, 401);
  assert.equal((await fetch(url + "verify", { headers: { cookie } })).status, 401);
});

test("delayed login and logout acknowledgments cannot replace a newer cookie", async t => {
  const profile = "f".repeat(32);
  let onGrant = async () => {}, onEnd = async () => {};
  const game = {
    async enroll() { return profile; },
    async authenticate(_email, value) {
      if (value !== password) throw Error(LOGIN_FAILED);
      return profile;
    },
    sessionChanged: (...args) => onGrant(...args),
    disconnect: (...args) => onEnd(...args),
  };
  const accounts = testerAccounts(":memory:", randomBytes(32), game);
  const invite = accounts.issueInvite("rotate@example.net", true);
  const original = await accounts.enroll(invite.email, invite.code, password);
  const sending = Promise.withResolvers(), delivered = Promise.withResolvers();
  const server = createPortal({ origin, accounts, game, mailInvite: async () => {
    sending.resolve();
    await delivered.promise;
  } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { await new Promise(resolve => server.close(resolve)); accounts.close(); });
  const post = (path, cookie, fields = { email: invite.email, password }) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: "POST", redirect: "manual", headers: { origin, ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(fields),
  });
  const holding = Promise.withResolvers(), release = Promise.withResolvers();
  onGrant = async () => {
    onGrant = async () => {};
    holding.resolve();
    await release.promise;
  };
  const signInElsewhere = async () => {
    const handoff = await handoffProof(await post("/sign-in"));
    return post("/__alpha/sign-in/transfer", "", { handoff, decision: "continue" });
  };
  const late = signInElsewhere();
  await holding.promise;
  assert.equal(accounts.viewer(original), undefined);
  const winner = (await signInElsewhere()).headers.get("set-cookie").split(";")[0];
  release.resolve();
  const stale = await late;
  assert.equal(stale.status, 409);
  assert.equal(stale.headers.get("set-cookie"), null);
  const viewer = accounts.viewer(winner.split("=")[1]);
  const ending = Promise.withResolvers(), disconnected = Promise.withResolvers();
  onEnd = async (id, digest) => {
    assert.equal(id, profile);
    assert.equal(digest, viewer.digest);
    ending.resolve();
    await disconnected.promise;
  };
  const logout = post("/__alpha/sign-out", winner);
  await ending.promise;
  assert.equal(accounts.viewer(winner.split("=")[1]), undefined);
  const next = await post("/sign-in");
  disconnected.resolve();
  assert.equal((await logout).headers.get("set-cookie"), null);
  const nextCookie = next.headers.get("set-cookie").split(";")[0];
  assert.equal(accounts.viewer(nextCookie.split("=")[1]).game_profile, profile);
  const pendingInvite = post("/__alpha/testers/invite", nextCookie, { email: "invited@example.net" });
  await sending.promise;
  assert.equal((await signInElsewhere()).status, 303);
  delivered.resolve();
  const retiredResponse = await pendingInvite;
  assert.equal(retiredResponse.status, 403);
  assert.equal(await retiredResponse.text(), "");
});

test("pending device switches follow one live grant, expire, and respect new MFA settings", async t => {
  const dir = await mkdtemp(join(tmpdir(), "avensky-session-switch-"));
  const path = join(dir, "social.sqlite3");
  const accountId = "c".repeat(32);
  const game = { async enroll() { return accountId; }, async authenticate() { return accountId; } };
  const accounts = testerAccounts(path, randomBytes(32), game);
  const db = new DatabaseSync(path);
  t.after(async () => { db.close(); accounts.close(); await rm(dir, { recursive: true }); });
  const { email, code } = accounts.issueInvite("transfer@example.net");
  const original = await accounts.enroll(email, code, password);
  assert.deepEqual(await accounts.beginSignIn(email, password, original), { current: true });
  const attempt = () => accounts.beginSignIn(email, password);
  const first = await attempt();
  const latest = await attempt();
  assert.equal(accounts.resolveHandoff(first.handoff, true), undefined);
  assert.ok(accounts.viewer(original));
  db.exec("UPDATE session_handoffs SET expires=0");
  assert.equal(accounts.resolveHandoff(latest.handoff, true), undefined);
  assert.ok(accounts.viewer(original));
  const stale = await attempt();
  accounts.end(accounts.viewer(original));
  assert.equal(accounts.resolveHandoff(stale.handoff, true), undefined);
  const next = await attempt();
  assert.ok(accounts.viewer(next.session));
  const beforeMfa = await attempt();
  const viewer = accounts.viewer(next.session);
  const encoded = await accounts.beginMfa(viewer, password);
  const bits = [...encoded].map(c => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0")).join("");
  const seed = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  accounts.enableMfa(viewer, totp(seed, Math.floor(Date.now() / 30_000) - 1));
  assert.equal(accounts.resolveHandoff(beforeMfa.handoff, true), undefined);
  const { challenge } = await attempt();
  const fromTotp = accounts.completeSignIn(challenge, totp(seed, Math.floor(Date.now() / 30_000)));
  assert.ok(fromTotp.handoff);
  assert.ok(accounts.viewer(next.session));
  assert.ok(accounts.viewer(accounts.resolveHandoff(fromTotp.handoff, true)));
  assert.equal(accounts.viewer(next.session), undefined);
});

test("a moderator can preserve a legacy profile without presenting a second login form", async t => {
  const profile = "b".repeat(32);
  const game = {
    async authenticate(login, attemptedPassword) {
      assert.equal(login, "legacy_racer");
      assert.equal(attemptedPassword, password);
      return profile;
    },
  };
  const accounts = testerAccounts(":memory:", randomBytes(32), game);
  t.after(() => accounts.close());
  const invite = accounts.issueInvite("legacy@example.net", true, "legacy_racer");
  const session = await accounts.enroll(invite.email, invite.code, password);
  assert.equal(accounts.viewer(session).game_profile, profile);
  const returning = accounts.resolveHandoff((await accounts.beginSignIn(invite.email, password)).handoff, true);
  assert.equal(accounts.viewer(returning).game_profile, profile);
});

test("private game reset links preserve the profile and require a separate invitation", async t => {
  const email = "driver@example.net";
  const profileId = "a".repeat(32);
  let currentPassword = password;
  const game = {
    async recoveryProfile(login) {
      if (login !== email) throw Error("No game account was found for this login.");
      return profileId;
    },
    async authenticate(login, attempted) {
      if (login !== email || attempted !== currentPassword) throw Error(LOGIN_FAILED);
      return profileId;
    },
    enroll(login, attempted) { return this.authenticate(login, attempted); },
    async resetPassword(id, login, next) {
      assert.equal(id, profileId);
      assert.equal(login, email);
      currentPassword = next;
    },
    async sessionChanged() {},
    async serverId() { return "b".repeat(32); },
  };
  const accounts = testerAccounts(":memory:", randomBytes(32), game);
  const server = createPortal({ origin, accounts, game });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { await new Promise(resolve => server.close(resolve)); accounts.close(); });
  const url = `http://127.0.0.1:${server.address().port}/__alpha/`;
  const post = (path, fields) => fetch(url + path, {
    method: "POST", redirect: "manual", headers: { origin }, body: new URLSearchParams(fields),
  });
  assert.match(await (await fetch(url + "sign-in")).text(), /Forgot password\?/);
  assert.match(await (await fetch(url + "enroll")).text(), /Forgot password\?/);
  assert.match(await (await fetch(url + "forgot-password")).text(), /Request password reset/);
  const known = await post("forgot-password", { email });
  const unknown = await post("forgot-password", { email: "other@example.net" });
  assert.equal(known.status, 200);
  assert.equal(await known.text(), await unknown.text());
  assert.deepEqual(accounts.list().resetRequests.map(request => request.email).sort(), [email, "other@example.net"]);
  assert.equal((await fetch(url + "testers")).status, 403);
  await assert.rejects(accounts.issuePasswordReset("other@example.net"), /No game account/);

  const expired = await accounts.issuePasswordReset(email);
  const active = await accounts.issuePasswordReset(email);
  assert.throws(() => accounts.inspectGamePasswordReset(email, expired.code), /invalid or expired/);
  const reset = { email, reset: active.code };
  const verify = await post("reset/verify", reset);
  assert.equal(verify.status, 200);
  const form = await verify.text();
  assert.match(form, /Set new password/);
  assert.doesNotMatch(form, /name="code"/);
  const completed = await post("reset", { ...reset, password: newPassword });
  assert.equal(completed.status, 200);
  assert.match(await completed.text(), /Password updated/);
  assert.equal((await post("reset", { ...reset, password })).status, 400);
  assert.equal((await post("sign-in", { email, password: newPassword })).status, 400);

  const invite = accounts.issueInvite(email);
  const session = await accounts.enroll(email, invite.code, newPassword);
  assert.equal(accounts.viewer(session).game_profile, profileId);
  const encoded = await accounts.beginMfa(accounts.viewer(session), newPassword);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...encoded].map(letter => alphabet.indexOf(letter).toString(2).padStart(5, "0")).join("");
  const seed = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const codes = accounts.enableMfa(accounts.viewer(session), totp(seed, Math.floor(Date.now() / 30000)));
  const enrolled = await accounts.issuePasswordReset(email);
  const enrolledReset = { email, reset: enrolled.code, password };
  assert.match(await (await post("reset/verify", enrolledReset)).text(), /Authenticator or recovery code/);
  assert.equal((await post("reset", enrolledReset)).status, 400);
  assert.equal((await post("reset", { ...enrolledReset, code: codes[0] })).status, 200);
  assert.equal(accounts.viewer(session), undefined);
  await assert.rejects(accounts.beginSignIn(email, newPassword), /password is incorrect/);
  const { challenge } = await accounts.beginSignIn(email, password);
  assert.deepEqual(accounts.completeSignIn(challenge, codes[0]), { challenge });
  const returning = accounts.completeSignIn(challenge, codes[1]).session;
  assert.equal(accounts.viewer(returning).game_profile, profileId);
});

test("access migration shares the player's SQLite file and preserves invites, sessions, MFA and revocation", async t => {
  const dir = await mkdtemp(join(tmpdir(), "avensky-single-db-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const previous = join(dir, "game-access.sqlite3"), target = join(dir, "social.sqlite3");
  const key = randomBytes(32);
  const player = { id: "a".repeat(32), account: { login: "driver@example.net" }, characters: ["original-character"] };
  const other = { id: "b".repeat(32), account: { login: "other@example.net" } };
  const game = {
    async authenticate(login, candidate) {
      if (candidate !== password) throw Error(LOGIN_FAILED);
      return login === player.account.login ? player.id : other.id;
    },
    async enroll(login, candidate) { return this.authenticate(login, candidate); },
  };
  const old = testerAccounts(previous, key, game);
  const admin = old.issueInvite(player.account.login, true);
  const cookie = await old.enroll(admin.email, admin.code, password);
  const seed = await old.beginMfa(old.viewer(cookie), password);
  const bits = [...seed].map(c => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0")).join("");
  const secret = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const codes = old.enableMfa(old.viewer(cookie), totp(secret, Math.floor(Date.now() / 30000)));
  const revoked = old.issueInvite(other.account.login);
  await old.enroll(revoked.email, revoked.code, password);
  old.revoke(revoked.email);
  old.issueInvite("next@example.net");
  old.close();
  // Exercise a deployed pre-takeover database, which predates the proof version column.
  const legacy = new DatabaseSync(previous);
  legacy.exec("ALTER TABLE sessions DROP COLUMN login_protocol");
  legacy.close();

  const db = new DatabaseSync(target);
  db.exec("CREATE TABLE player_profiles(id TEXT PRIMARY KEY, document TEXT NOT NULL); CREATE TABLE social_state(singleton INTEGER PRIMARY KEY, document TEXT); INSERT INTO social_state VALUES(1,'{}')");
  const save = db.prepare("INSERT INTO player_profiles VALUES(?,?)");
  save.run(player.id, JSON.stringify(player));
  assert.throws(() => consolidateAccess(target, previous), /existing game profile/);
  assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name='testers'").get(), undefined);
  save.run(other.id, JSON.stringify(other));
  assert.equal(consolidateAccess(target, previous), "imported alpha access");
  checkSharedDatabase(target);
  assert.equal(db.prepare("SELECT document FROM player_profiles WHERE id=?").get(player.id).document, JSON.stringify(player));
  // Pre-takeover releases could retain more than one unexpired browser cookie.
  const olderCookie = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions(digest,email,expires) SELECT ?,email,expires-1 FROM sessions WHERE email=?")
    .run(createHash("sha256").update(olderCookie).digest("hex"), player.account.login);
  const current = testerAccounts(target, key, game);
  try {
    assert.equal(current.viewer(cookie).game_profile, player.id);
    assert.equal(current.viewer(olderCookie), undefined);
    assert.equal(db.prepare("SELECT login_protocol FROM sessions WHERE email=?").get(player.account.login).login_protocol, 1);
    const { challenge } = await current.beginSignIn(admin.email, password);
    const latest = current.resolveHandoff(current.completeSignIn(challenge, codes[0]).handoff, true);
    assert.ok(current.viewer(latest));
    assert.equal(db.prepare("SELECT login_protocol FROM sessions WHERE email=?").get(player.account.login).login_protocol, 2);
    assert.equal(current.viewer(cookie), undefined);
    await assert.rejects(current.beginSignIn(other.account.login, password));
    assert.deepEqual(current.list().invites.map(invite => invite.email), ["next@example.net"]);
    current.end(current.viewer(latest));
    assert.equal(current.viewer(olderCookie), undefined);
    assert.equal(consolidateAccess(target, previous), "already consolidated");
    assert.equal(current.viewer(cookie), undefined);
    assert.equal(db.prepare("SELECT count(*) AS n FROM testers WHERE password<>'' OR salt<>''").get().n, 0);
  } finally { current.close(); db.close(); }
});
