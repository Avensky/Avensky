import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, createRef } from "react";
import { createServer } from "vite";

test("profile rows use verified account permissions, server actions and a single disposable editor", async () => {
  const dom = new JSDOM('<main id="test"></main>', { url: "https://staging.avensky.test/", pretendToBeVisual: true });
  const previous = new Map();
  let admin = false;
  const requests = [], socketMessages = [];
  let finishRequest;
  const portalFetch = async (url, options) => {
    if (url === "/__alpha/session") return Response.json({ email: "private@example.test", hasMfa: true, admin });
    requests.push({ url, options, fields: Object.fromEntries(options.body) });
    return new Promise(resolve => { finishRequest = data => resolve(Response.json(data)); });
  };
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
    localStorage: dom.window.localStorage, FormData: dom.window.FormData, fetch: portalFetch,
    navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const vite = await createServer({ mode: process.env.VITE_DEPLOY_ENV || "development",
    server: { middlewareMode:true, hmr:false, ws:false }, appType:"custom", logLevel:"error" });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.querySelector("#test"));
  try {
    const { GarageProfilePanel } = await vite.ssrLoadModule("/src/game/characters/GarageProfilePanel.tsx");
    const { useSocialStore: social } = await vite.ssrLoadModule("/src/store/social/socialStore.ts");
    const client = await vite.ssrLoadModule("/src/net/socialClient.ts");
    client.setSocialConnection({ readyState: WebSocket.OPEN, send: body => socketMessages.push(JSON.parse(body)) });
    client.beginSocialSession("stage", undefined, true, true, true);
    const profile = { id: "owner", active_character_id: "slot", name: "Racing career", account_display_name: "Road Pilot" };
    social.setState({ view: { profile } });
    let backs = 0;
    const panel = createRef();
    const render = key => act(async () => root.render(createElement(GarageProfilePanel, { key, ref: panel, onBack: () => { backs++; } })));
    const row = key => document.querySelector(`[data-profile-setting="${key}"]`);
    const action = text => [...document.querySelectorAll('[role="button"]')].find(button => button.textContent === text);
    const click = element => act(async () => element.click());
    const enter = (name, value) => { document.querySelector(`input[name="${name}"]`).value = value; };

    await render("tester");
    assert.equal(document.activeElement, row("name"));
    assert.match(row("name").textContent, /Road Pilot/);
    assert.match(row("email").textContent, /p•••@example.test/);
    assert.doesNotMatch(document.body.textContent, /private@example.test|Racing career/);
    assert.equal(row("invite").getAttribute("aria-disabled"), "true");
    await click(row("invite"));
    assert.equal(document.querySelector("form"), null);

    await click(row("name"));
    enter("displayName", "  Speed Racer  ");
    await click(action("Save name"));
    assert.equal(socketMessages.at(-1).action, "rename");
    assert.equal(socketMessages.at(-1).name, "Speed Racer");
    await act(async () => {
      client.receiveSocialResult({ request_id: socketMessages.at(-1).request_id, ok: true });
      social.setState({ view: { profile: { ...profile, account_display_name: "Speed Racer" } } });
    });
    assert.match(row("name").textContent, /Speed Racer/);
    assert.match(document.querySelector('[role="status"]').textContent, /saved/);

    await click(row("email"));
    enter("newEmail", "next@example.test"); enter("password", "test-secret");
    await act(async () => document.querySelector('[name="password"]').dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key:"Enter", bubbles:true, cancelable:true })));
    await click(action("Request email change"));
    assert.equal(requests.length, 1, "a pending mutation cannot submit twice");
    assert.equal(requests[0].url, "/__alpha/account/email-request");
    assert.deepEqual(requests[0].fields, { newEmail:"next@example.test", password:"test-secret" });
    await act(async () => finishRequest({ message: "Check your email." }));
    assert.match(document.querySelector('[role="status"]').textContent, /Check your email/);
    assert.equal(document.querySelector('[name="password"]').value, "");

    await click(row("delete"));
    assert.equal(requests.length, 1, "opening Delete account never sends a deletion request");
    assert.equal(document.querySelector('[name="newEmail"]'), null);
    enter("confirmEmail", "private@example.test"); enter("password", "test-secret");
    await click(action("Request profile deletion"));
    assert.equal(requests.at(-1).url, "/__alpha/account/delete-request");
    assert.deepEqual(requests.at(-1).fields, { confirmEmail:"private@example.test", password:"test-secret" });
    await act(async () => finishRequest({ message: "Request received for review." }));
    await act(async () => panel.current.back());
    assert.equal(document.querySelector('[aria-expanded="true"]'), null);
    assert.equal(document.activeElement, row("delete"));
    assert.equal(backs, 0);
    await act(async () => panel.current.back());
    assert.equal(backs, 1);

    admin = true;
    await render("admin");
    await click(row("invite"));
    enter("email", "invitee@example.test");
    await click(action("Create invite"));
    assert.equal(requests.at(-1).url, "/__alpha/testers/invite");
    await act(async () => finishRequest({ sent: false, url: "https://staging.avensky.test/__alpha/enroll#example" }));
    assert.match(document.querySelector("input[readonly]").value, /enroll#/);
    await click(row("security"));
    assert.equal(document.querySelector("input[readonly]"), null, "closing invites clears the returned private link");
    assert.match(document.querySelector(".account-security").textContent, /enabled/);
    await act(async () => social.setState({ view: { profile: { ...profile, account_display_name: undefined } } }));
    await click(row("name"));
    assert.equal(document.querySelector('[name="displayName"]'), null, "an old server's career name is never used as its account name");
  } finally {
    await act(async () => root.unmount()); await vite.close(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
