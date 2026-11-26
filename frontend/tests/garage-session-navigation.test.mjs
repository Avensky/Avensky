import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { garageBrandHeader, garageBackdrop, garageCredentials } from "../src/theme/garageEntry.ts";

test("repeated portal and game handoffs carry one canvas and reuse the loaded game", async () => {
  const base = "https://staging.avensky.com";
  const dom = new JSDOM('<div id="root"></div>', { url: base, runScripts: "outside-only" });
  const { window } = dom;
  const { document } = window;
  const game = '<div id="root"></div><script type="module" src="/assets/game.js"></script>';
  const form = garageBrandHeader("/__alpha/entry") + '<main class="garage-entry-body"><section class="garage-entry-card">' +
    '<form method="post" class="garage-credentials" action="/sign-in">' + garageCredentials(true) + "</form></section></main>";
  document.querySelector("#root").innerHTML = garageBackdrop();
  const room = document.querySelector("[data-live-garage]");
  const canvas = room.appendChild(document.createElement("canvas"));
  const posts = [];
  window.fetch = async (url, options) => {
    const path = new URL(url, base).pathname;
    posts.push([options.method, path]);
    const publicForm = path === "/__alpha/sign-out" || (path === "/sign-in" && options.credentials === "omit");
    return { ok: true, url: base + (publicForm ? "/sign-in" : "/"), headers: new Headers({ "content-type": "text/html" }),
      text: async () => publicForm ? form : game };
  };
  window.addEventListener("avensky:leave-game", () => document.querySelector("#root").remove());
  window.addEventListener("avensky:resume-game", event => {
    event.preventDefault();
    document.querySelector("#root").append(room);
    document.querySelector("#startup-screen").remove();
  });
  try {
    window.eval(await readFile(new URL("../public/images/sign-in-navigation.js", import.meta.url), "utf8"));
    for (let session = 0; session < 2; session++) {
      await window.avenskyPortalNavigation.showSignIn(true);
      if (session === 0) await window.avenskyPortalNavigation.showSignIn(true);
      assert.equal(window.location.pathname, "/sign-in");
      assert.equal(document.querySelectorAll(".garage-entry-header").length, 1);
      assert.equal(document.querySelectorAll(".garage-credentials").length, 1);
      assert.equal(document.body.querySelector("canvas"), canvas);
      const resumed = new Promise(resolve => window.addEventListener("avensky:resume-game", resolve, { once: true }));
      document.querySelector("form").dispatchEvent(new window.Event("submit", { cancelable: true, bubbles: true }));
      await resumed;
      assert.equal(window.location.pathname, "/");
      assert.equal(document.querySelector("#root canvas"), canvas);
    }
    assert.deepEqual(posts, ["/__alpha/sign-out", "/__alpha/sign-out", "/sign-in", "/__alpha/sign-out", "/sign-in"]
      .map(path => ["POST", path]));
    posts.length = 0;
    await window.avenskyPortalNavigation.showSignIn(false, "You signed in on another device.");
    assert.deepEqual(posts, [[undefined, "/sign-in"]], "a replaced socket never posts a logout");
    assert.match(document.querySelector(".garage-notices").textContent, /another device/);
    assert.equal(document.querySelector("canvas"), canvas);
    assert.equal(document.querySelectorAll("canvas").length, 1);
  } finally {
    window.close();
  }
});

const base = "https://staging.avensky.com";
const credentials = '<main class="garage-entry-body"><section class="garage-entry-card">' +
  '<form method="post" class="garage-credentials" action="/sign-in">' + garageCredentials(true) +
  '</form><div class="garage-recovery"><a href="/__alpha/forgot-password">Forgot password?</a></div></section></main>';
const protectedPage = '<div id="root"></div><script type="module" src="/assets/game.js"></script>';
const portalScript = await readFile(new URL("../public/images/sign-in-navigation.js", import.meta.url), "utf8");

test("a fast sign-in interrupts the logout dissolve without retiring the next login", async () => {
  const { window, document, canvas } = entryFixture();
  try {
    const main = document.querySelector("main");
    const source = document.createElement("main");
    source.className = "welcome-screen";
    source.innerHTML = '<div class="character-roster"></div>';
    document.body.append(source);
    const navigation = window.avenskyPortalNavigation;
    const reveal = navigation.captureLogout();
    source.remove();
    main.querySelector(".garage-entry-card").dataset.controlsReady = "true";
    reveal();
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    const retired = document.querySelector("#garage-logout-handoff");
    assert.ok(main.classList.contains("garage-entry-incoming"));
    navigation.beginHandoff(main, document.querySelector("body > header"));
    assert.equal(retired.isConnected, false);
    assert.equal(main.classList.contains("garage-entry-incoming"), false);
    assert.equal(document.documentElement.hasAttribute("data-logout-handoff"), false);
    retired.dispatchEvent(new window.Event("animationend"));
    assert.equal(document.documentElement.dataset.entryHandoff, "waiting");
    assert.ok(document.querySelector("#garage-entry-handoff"));
    assert.equal(document.querySelector("canvas"), canvas);
  } finally { window.close(); }
});

test("confirmed logout retires the original UI over the unchanged room, including an early socket close", async () => {
  const dom = new JSDOM('<link rel="stylesheet" href="/assets/game.css"><div id="root">' + garageBackdrop() +
    '<main class="welcome-screen">' + garageBrandHeader("/__alpha/entry") +
    '<div class="character-roster"><img alt="Driver"><div role="button">Driver</div></div></main></div>',
    { url: base, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  const room = document.querySelector("[data-live-garage]"), canvas = room.appendChild(document.createElement("canvas"));
  const roster = document.querySelector(".character-roster");
  const header = document.querySelector(".garage-entry-header"), tabs = document.createElement("nav");
  tabs.className = "garage-entry-actions"; header.append(tabs);
  const style = document.querySelector('link[rel="stylesheet"]');
  window.addEventListener("avensky:leave-game", () => document.querySelector("#root").remove());
  try {
    window.eval(portalScript);
    window.fetch = async () => { throw Error("offline"); };
    await assert.rejects(window.avenskyPortalNavigation.showSignIn(true), /offline/);
    assert.ok(roster.isConnected && !roster.inert, "a failed logout leaves the actual menu available");
    assert.equal(document.querySelector("#garage-logout-handoff"), null);
    window.fetch = async () => {
      document.querySelector(".welcome-screen").remove();
      return { ok: true, url: base + "/sign-in", text: async () => garageBrandHeader("/__alpha/entry") + credentials };
    };
    await window.avenskyPortalNavigation.showSignIn(true);
    const layer = document.querySelector("#garage-logout-handoff");
    assert.equal(document.documentElement.dataset.logoutHandoff, "waiting");
    assert.ok(layer.inert && layer.getAttribute("aria-hidden") === "true");
    assert.equal(layer.querySelector(".character-roster"), roster);
    assert.equal(layer.querySelector(".garage-entry-actions"), tabs);
    assert.equal(layer.querySelector("canvas, form, input, .garage-entry-brand"), null);
    assert.equal(document.querySelectorAll(".garage-entry-brand").length, 1);
    assert.equal(document.body.querySelector("canvas"), canvas);
    assert.equal(style.disabled === true, false, "the retired UI keeps its styling during the blend");
    document.querySelector(".garage-entry-card").dataset.controlsReady = "true";
    await Promise.resolve();
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    const form = document.querySelector("main.garage-entry-body");
    assert.ok(form.classList.contains("garage-entry-incoming") && layer.classList.contains("garage-entry-outgoing"));
    layer.dispatchEvent(new window.Event("animationend"));
    assert.equal(document.querySelector("#garage-logout-handoff"), null);
    assert.equal(document.documentElement.hasAttribute("data-logout-handoff"), false);
    assert.equal(style.disabled, true);
    assert.equal(document.body.querySelector("canvas"), canvas);
    assert.equal(document.querySelectorAll("canvas").length, 1);
  } finally { dom.window.close(); }
});

function entryFixture() {
  const dom = new JSDOM('<body class="garage-entry">' + garageBackdrop() + garageBrandHeader("/__alpha/entry") + credentials +
    '</body>', { url: base + "/sign-in", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  const room = document.querySelector("[data-live-garage]");
  const canvas = room.appendChild(document.createElement("canvas"));
  const requests = [];
  const answers = [];
  window.fetch = async (url, options) => {
    requests.push([options.method ?? "GET", new URL(url, base).pathname]);
    const [status, pathname, html] = answers.shift();
    return { ok: status < 400, url: base + pathname, headers: new Headers({ "content-type": "text/html" }), text: async () => html };
  };
  function mount(event) {
    event.preventDefault();
    const screen = document.createElement("main");
    screen.className = "welcome-screen";
    document.querySelector("#root").append(room, screen);
    document.querySelector("#startup-screen").remove();
  }
  window.eval(portalScript);
  return { window, document, canvas, requests, answers, mount,
    submit: () => document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })),
    tick: () => new Promise(resolve => setImmediate(resolve)) };
}

test("verified credentials become an inert, sanitized face until the roster starts its camera shot", async () => {
  const { window, document, canvas, answers, mount, submit, tick } = entryFixture();
  try {
    window.addEventListener("avensky:resume-game", mount);
    const email = document.querySelector('[name="email"]');
    const password = document.querySelector('[name="password"]');
    email.value = "fixture-player@example.test";
    password.type = "text";
    password.value = "fixture-secret";
    password.focus();
    const card = document.querySelector(".garage-entry-card");
    card.getBoundingClientRect = () => ({ left: 33, top: 62, width: 299 });
    answers.push([200, "/", protectedPage]);
    submit();
    await tick();
    const layer = document.querySelector("#garage-entry-handoff");
    assert.equal(layer.inert, true);
    assert.equal(layer.getAttribute("aria-hidden"), "true");
    assert.equal(layer.querySelector("input,button,textarea,form,a,[tabindex],[href]"), null);
    assert.doesNotMatch(layer.innerHTML, /fixture-secret|fixture-player/);
    assert.equal(layer.querySelector(".garage-entry-card").style.top, "62px");
    assert.equal(email.value, "");
    assert.equal(password.value, "");
    assert.equal(password.type, "password");
    assert.notEqual(document.activeElement, password);
    assert.equal(document.querySelector("canvas"), canvas);
    assert.equal(document.querySelectorAll(".garage-entry-header").length, 1);

    for (const detail of ["pending", "roster"]) window.dispatchEvent(new window.CustomEvent("avensky:entry-view", { detail }));
    assert.equal(document.documentElement.dataset.entryHandoff, "waiting");
    const screen = document.querySelector(".welcome-screen");
    assert.equal(screen.inert, true);
    const interactive = new Promise(resolve => window.addEventListener("avensky:entry-interactive", resolve, { once: true }));
    window.dispatchEvent(new window.Event("avensky:roster-framing"));
    await interactive;
    assert.equal(screen.inert, false);
    assert.equal(document.documentElement.dataset.entryHandoff, "fading");
    layer.dispatchEvent(new window.Event("animationend", { bubbles: true }));
    assert.equal(document.querySelector("#garage-entry-handoff"), null);
    assert.equal(document.documentElement.hasAttribute("data-entry-handoff"), false);
    assert.equal(document.querySelector("canvas"), canvas);
  } finally { window.close(); }
});

test("a rejected password and the MFA challenge remain real forms; a failed verified module retries using GET", async () => {
  const { window, document, canvas, answers, requests, mount, submit, tick } = entryFixture();
  try {
    const factor = '<main class="garage-entry-body"><section class="garage-entry-card garage-entry-account">' +
      '<form method="post" action="/sign-in"><input type="hidden" name="challenge" value="used-challenge">' +
      '<input name="code" autocomplete="one-time-code"><button>Verify</button></form></section></main>';
    answers.push([400, "/sign-in", credentials], [200, "/sign-in", factor], [200, "/", protectedPage]);
    submit();
    await tick();
    assert.ok(document.querySelector('form input[name="password"]'));
    assert.equal(document.querySelector("#garage-entry-handoff"), null);
    submit();
    await tick();
    assert.equal(document.querySelector("form input[name=challenge]").value, "used-challenge");
    assert.equal(document.querySelector("#garage-entry-handoff"), null);
    const code = document.querySelector("[name=code]");
    code.value = "123456";
    submit(); // No resume-game listener and no VM module loader: the protected import rejects.
    await tick();
    const retry = document.querySelector("a[href='/']");
    assert.equal(retry?.textContent, "Retry game");
    assert.equal(code.value, "");
    assert.equal(document.querySelector("[name=challenge], #garage-entry-handoff, form"), null);

    window.addEventListener("avensky:resume-game", mount);
    window.matchMedia = () => ({ matches: true });
    answers.push([200, "/", protectedPage]);
    retry.click();
    await tick();
    window.dispatchEvent(new window.CustomEvent("avensky:entry-view", { detail: "ready" }));
    assert.equal(document.querySelector("#garage-entry-handoff"), null, "reduced motion makes the game immediately interactive");
    assert.equal(document.querySelector("canvas"), canvas);
    assert.deepEqual(requests, [["POST","/sign-in"],["POST","/sign-in"],["POST","/sign-in"],["GET","/"]]);
  } finally { window.close(); }
});

test("a protected build without entry events releases the previous shell", async () => {
  const { window, document, answers, mount, submit, tick } = entryFixture();
  try {
    window.addEventListener("avensky:resume-game", mount);
    const timers = new Map();
    window.setTimeout = (fn, delay) => { timers.set(delay, fn); return delay; };
    window.matchMedia = () => ({ matches: true });
    answers.push([200, "/", protectedPage]);
    submit();
    await tick();
    assert.ok(document.querySelector("#garage-entry-handoff"));
    timers.get(1600)();
    assert.equal(document.querySelector("#garage-entry-handoff"), null);
    assert.ok(document.querySelector("#root canvas"));
  } finally { window.close(); }
});

test("a stalled avatar and an unavailable renderer both release the roster", async () => {
  for (const rendererUnavailable of [false, true]) {
    const { window, document, answers, mount, submit, tick } = entryFixture();
    try {
      window.addEventListener("avensky:resume-game", mount);
      const timers = new Map();
      window.setTimeout = (fn, delay) => { timers.set(delay, fn); return delay; };
      answers.push([200, "/", protectedPage]);
      submit();
      await tick();
      if (rendererUnavailable) document.querySelector("[data-live-garage]").dataset.garageUnavailable = "true";
      window.dispatchEvent(new window.CustomEvent("avensky:entry-view", { detail: "roster" }));
      const screen = document.querySelector(".welcome-screen");
      if (rendererUnavailable) assert.equal(timers.has(480), false, "no camera to wait for");
      else {
        assert.equal(screen.inert, true);
        timers.get(480)();
      }
      await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      assert.equal(document.documentElement.dataset.entryHandoff, "fading");
      assert.notEqual(screen.inert, true);
      document.querySelector("#garage-entry-handoff").dispatchEvent(new window.Event("animationend"));
      assert.equal(document.querySelector("#garage-entry-handoff"), null);
    } finally { window.close(); }
  }
});
