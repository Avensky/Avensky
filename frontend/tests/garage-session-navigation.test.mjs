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
    const signingOut = path === "/__alpha/sign-out";
    return { ok: true, url: base + (signingOut ? "/sign-in" : "/"), headers: new Headers({ "content-type": "text/html" }),
      text: async () => signingOut ? form : game };
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
    assert.equal(document.querySelectorAll("canvas").length, 1);
  } finally {
    window.close();
  }
});
