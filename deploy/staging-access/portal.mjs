import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { emailAddress, SESSION_AGE, testerAccounts } from "./accounts.mjs";
import { cookieName, gameBridge, gameSocketGate, sessionCookie } from "./game-bridge.mjs";

const base = "/__alpha";
const cookieFlags = "Path=/; HttpOnly; Secure; SameSite=Lax";
const sourcePalettes = new URL("../../frontend/src/theme/palettes.json", import.meta.url);
const themes = JSON.parse(readFileSync(existsSync(sourcePalettes) ? sourcePalettes : new URL("./palettes.json", import.meta.url), "utf8"));
const defaultColors = Object.entries(themes.navy)
  .filter(([key]) => key !== "label" && key !== "scheme")
  .map(([key, color]) => `--app-${key}:${color}`).join(";");

const sourceEntry = new URL("../../frontend/src/theme/garageEntry.ts", import.meta.url);
const { garageBackdrop, garageBrandHeader, garageCredentials, GARAGE_ENTRY_POSTER, GARAGE_ENTRY_STORAGE_KEY } = await import(existsSync(sourceEntry) ? sourceEntry.href : new URL("./garageEntry.ts", import.meta.url).href);
const sourceImages = new URL("../../frontend/public/images/", import.meta.url);
const entryImages = existsSync(sourceImages) ? sourceImages : new URL("file:///srv/avensky-staging/frontend/current/images/");
const entryAssets = new Map([
  ["logo.svg", "image/svg+xml"], ["entry-icons.svg", "image/svg+xml"],
  [GARAGE_ENTRY_POSTER, "image/webp"], ["garage-entry.css", "text/css"], ["angled-header.css", "text/css"],
]);
function paletteScript() {
  return `(() => {
    const themes = ${JSON.stringify(themes)};
    let chosen = "navy";
    try {
      const saved = JSON.parse(localStorage.getItem("avenlab-preferences-v1") || "{}");
      if (Object.hasOwn(themes, saved?.state?.theme)) chosen = saved.state.theme;
    } catch {}
    try { localStorage.setItem(${JSON.stringify(GARAGE_ENTRY_STORAGE_KEY)}, ${JSON.stringify(GARAGE_ENTRY_POSTER)}); } catch {}
    const palette = themes[chosen];
    const root = document.documentElement;
    root.dataset.uiTheme = chosen;
    root.dataset.uiScheme = palette.scheme;
    root.style.colorScheme = palette.scheme;
    for (const [key, color] of Object.entries(palette)) {
      if (key !== "label" && key !== "scheme") root.style.setProperty("--app-" + key, color);
    }
  })();`;
}
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const form = (action, contents, label) =>
  `<form method="post" action="${base}/${action}">${contents}<button>${label}</button></form>`;
const emailField = '<label>Email<input type="email" name="email" autocomplete="username" maxlength="254" required></label>';
const passwordField = (newPassword = false, id = "alpha-password") =>
  `<div class="password-control"><label>Password<input id="${id}" type="password" name="password" autocomplete="${newPassword ? "new-password" : "current-password"}" maxlength="128" ${newPassword ? 'minlength="15"' : ""} required></label>
  <button type="button" class="password-toggle" aria-controls="${id}" hidden>Show password</button></div>`;
const codeField = (required = false) => `<label>Authenticator or recovery code<input name="code" autocomplete="one-time-code" autocapitalize="none" spellcheck="false" maxlength="32"${required ? " required" : ""}></label>`;
const linkField = (name, label) => `<label>${label}<input id="link-code" name="${name}" minlength="64" maxlength="64" required></label>`;
const readLinkFragment = `<script src="${base}/invite.js"></script>`;
const backToSignIn = `<a class="portal-back" href="${base}/sign-in" aria-label="Back to sign in" title="Back to sign in"><span aria-hidden="true">‹</span></a>`;
const hideEmail = email => `<input type="hidden" name="email" value="${escape(email)}">`;

function page(title, contents, message = "", garage = false) {
  if (garage) {
    const signIn = garage === "login";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escape(title)} · Avensky</title><style>html{color-scheme:${themes.navy.scheme};${defaultColors}}</style>
<script src="${base}/theme.js"></script><link rel="stylesheet" href="${base}/entry/garage-entry.css">
<script src="${base}/password.js" defer></script></head><body class="garage-entry">
${garageBackdrop("/__alpha/entry")}${garageBrandHeader("/__alpha/entry")}<main class="garage-entry-body"><section class="garage-entry-card" aria-label="${escape(title)}">
${signIn ? "" : `<h1>${escape(title)}</h1>`}${message ? `<p role="alert">${escape(message)}</p>` : ""}${contents}
</section></main></body></html>`;
  }
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Avensky</title>
<style>
*{box-sizing:border-box}html{color-scheme:${themes.navy.scheme};${defaultColors}}body{margin:0;color:var(--app-text);background:var(--app-background);font:1rem system-ui;min-height:100dvh;display:grid;align-items:center}
main{position:relative;width:min(calc(100% - 2rem),34rem);margin:2rem auto}h1{font-size:1.5rem;margin:0 0 1rem}
a{color:var(--app-accent);text-decoration:none}a:hover{text-decoration:none}form,label,ul{display:grid;gap:.6rem}label[hidden]{display:none}form{margin:.8rem 0}input,button{font:inherit;color:var(--app-text);padding:.6rem .8rem;border:1px solid var(--app-line);border-radius:0;background:var(--app-panel);min-height:44px;min-width:0}
button{color:var(--app-text);background:var(--app-raised);font-weight:600;cursor:pointer}button:is(:hover,:focus-visible){border-color:var(--app-accent);outline-color:var(--app-accent)}
.password-control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.5rem;align-items:end}
.password-toggle{background:var(--app-panel);color:inherit;font-size:.875rem}
ul{padding:0;list-style:none}li{border-top:1px solid var(--app-line);padding:.5rem 0;overflow-wrap:anywhere}li form{display:inline}li button{min-height:2.5rem;padding:.35rem .55rem}
.portal-back{display:inline-grid;place-items:center;width:44px;height:44px;color:var(--app-text);border:1px solid var(--app-line);background:var(--app-panel);font-size:1.6rem}.portal-back:focus-visible{outline:2px solid var(--app-accent)}code{overflow-wrap:anywhere}nav{display:flex;flex-wrap:wrap;gap:.9rem}
</style><script src="${base}/theme.js"></script><script src="${base}/password.js" defer></script><main><h1>${escape(title)}</h1>${message ? `<p role="alert">${escape(message)}</p>` : ""}${contents}</main></html>`;
}

function securityPage(viewer) {
  return `<nav><a href="/">Continue to game</a>${viewer.admin ? `<a href="${base}/testers">Alpha testers</a>` : ""}</nav>
<p>Signed in as ${escape(viewer.email)}</p>
<h2>Email</h2><p>Request a change to your account email. Your current address remains active until verified.</p>
${form("account/email-request", '<label>New email<input type="email" name="newEmail" autocomplete="email" maxlength="254" required></label>' + passwordField(false, "alpha-password-email"), "Request email change")}
<h2>Profile deletion</h2><p>Request deletion for operator review. Your game profile is not deleted by this action.</p>
${form("account/delete-request", '<label>Confirm your current email<input type="email" name="confirmEmail" maxlength="254" required></label>' + passwordField(false, "alpha-password-delete"), "Request profile deletion")}
${viewer.has_mfa ? "<p>Two-factor authentication is enabled.</p>"
    : `<h2 id="two-factor">Two-factor authentication</h2>${form("mfa/start", passwordField(false, "alpha-password-mfa"), "Set up authenticator")}`}
${form("sign-out", "", "Log out")}`;
}

async function readForm(req) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/x-www-form-urlencoded")
    throw Error("Submit the form from the staging website.");
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 4096) throw Error("The form is too large.");
    chunks.push(chunk);
  }
  const fields = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  return key => fields.get(key) ?? "";
}

export function createPortal({ origin, accounts, mailInvite, game }) {
  if (new URL(origin).protocol !== "https:" || new URL(origin).origin !== origin)
    throw Error("Use the HTTPS origin of the staging site.");
  const attempts = new Map();
  let active = 0, cleanupAt = 0;

  function admit(client) {
    const time = Date.now();
    if (time > cleanupAt) {
      for (const [ip, entry] of attempts) if (entry.expires <= time) attempts.delete(ip);
      cleanupAt = time + 10000;
    }
    let entry = attempts.get(client);
    if (!entry || entry.expires <= time) {
      if (attempts.size >= 2048) return false;
      entry = { count: 0, expires: time + 60000 };
      attempts.set(client, entry);
    }
    if (entry.count >= 12 || active >= 2) return false;
    entry.count++;
    return true;
  }

  function signInPage(message, invite = false) {
    return invite ? page("Join the alpha", form("enroll", emailField
      + linkField("invite", "Invitation code") + (game ? '<input type="hidden" name="deviceToken">' : "")
      + passwordField(!game), game ? "Continue" : "Sign up") + `<nav>${backToSignIn}
      <a href="${base}/forgot-password">Forgot password?</a></nav>` + readLinkFragment, message, true)
      : page("Sign in", `<form method="post" action="${base}/sign-in" class="garage-credentials">${garageCredentials(true)}</form>
        <div class="garage-recovery"><a href="${base}/forgot-password">Forgot password?</a></div>`, message, "login");
  }

  function factorPage(challenge, message) {
    return page("Verify your sign-in", form("sign-in/code",
      `<input type="hidden" name="challenge" value="${escape(challenge)}">` + codeField(true), "Verify")
      + `${backToSignIn}`, message, true);
  }

  function forgotPasswordPage(message) {
    return page("Forgot password?", "<p>Use the email from your staging invitation. The staging operator sends reset links privately.</p>"
      + form("forgot-password", emailField, "Request password reset")
      + `<nav><a href="${base}/reset">I have a reset link</a>${backToSignIn}</nav>`, message, true);
  }

  function resetPage(message, verification) {
    if (game) {
      const contents = verification
        ? form("reset", hideEmail(verification.email) + `<input type="hidden" name="reset" value="${escape(verification.code)}">`
          + passwordField(true) + (verification.needsFactor ? codeField(true) : ""), "Set new password")
        : form("reset/verify", emailField + linkField("reset", "Reset code"), "Continue") + readLinkFragment;
      return page("Reset game password", contents + `<a href="${base}/forgot-password">Request a new link</a>`, message, true);
    }
    return page("Reset alpha password", '<p>Include an authenticator or recovery code if you enabled two-factor authentication.</p>'
      + form("reset", emailField + linkField("reset", "Reset code") + passwordField(true) + codeField(), "Set new password")
      + `${backToSignIn}` + readLinkFragment, message, true);
  }

  function testerPage(viewer, message, extra = "") {
    if (!viewer?.admin) return page("Access denied", '<a href="/">Return to staging</a>');
    const { testers, invites, resetRequests, emailChanges, deletionRequests } = accounts.list();
    const fields = game
      ? emailField + '<details><summary>Preserve a legacy username</summary><label>Existing game username<input name="gameLogin" maxlength="24"></label></details>'
      : emailField;
    const requests = resetRequests.length ? `<h2>Password reset requests</h2>
<p>Verify the player's identity before issuing a private reset link on the staging server.</p>
<ul>${resetRequests.map(({ email }) => `<li>${escape(email)}</li>`).join("")}</ul>` : "";
    return page("Alpha testers", `<nav><a href="/">Continue to game</a><a href="${base}/account">Account</a></nav>
${form("testers/invite", fields, mailInvite ? "Send invite" : "Create invite")}${extra}
<h2>Testers</h2><ul>${testers.map(t => `<li>${escape(t.email)} · ${t.admin ? "Admin" : t.revoked ? "Revoked" : "Active"}${t.has_mfa ? " · 2FA" : ""}
${t.admin ? "" : form(t.revoked ? "testers/restore" : "testers/revoke", hideEmail(t.email), t.revoked ? "Grant access" : "Revoke access")}</li>`).join("")}</ul>
<h2>Pending invitations</h2><ul>${invites.map(i => `<li>${escape(i.email)} · Expires ${new Date(i.expires * 1000).toISOString().slice(0, 10)}
${form("testers/revoke", hideEmail(i.email), "Revoke invite")}</li>`).join("")}</ul>${requests}
${emailChanges.length ? `<h2>Pending email changes</h2><ul>${emailChanges.map(row => `<li>${escape(row.email)} → ${escape(row.new_email)} · operator verification required</li>`).join("")}</ul>` : ""}
${deletionRequests.length ? `<h2>Pending profile deletion requests</h2><ul>${deletionRequests.map(row => `<li>${escape(row.email)} · game-data review required</li>`).join("")}</ul>` : ""}`, message);
  }

  return createServer({ requestTimeout: 12000, headersTimeout: 7000, maxHeaderSize: 8192 }, async (req, res) => {
    const path = req.url?.split("?")[0];
    const send = (status, body = "", headers = {}) => {
      res.writeHead(status, {
        // A same-origin form submission needs its Origin header for the check below.
        "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "same-origin",
        "Content-Security-Policy": "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self'; media-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        "X-Content-Type-Options": "nosniff", ...headers,
      });
      res.end(body);
    };
    const json = (status, value) => send(status, JSON.stringify(value), { "Content-Type": "application/json; charset=utf-8" });
    const wantsJson = req.headers.accept?.includes("application/json");
    const redirect = (location, value) => send(303, "", {
      Location: location,
      ...(value === undefined ? {} : {
        "Set-Cookie": `${cookieName}=${value}; Max-Age=${value ? SESSION_AGE : 0}; ${cookieFlags}`,
      }),
    });
    const factorRateLimited = () => send(429, signInPage("Too many incorrect codes. Wait five minutes, then log in again."),
      { "Retry-After": "300" });
    let viewer;
    try { viewer = accounts.viewer(sessionCookie(req)); }
    catch { return send(503); }
    if (req.method === "GET") {
      if (path === base + "/verify") {
        if (viewer) return send(204);
        const requested = req.headers["x-forwarded-uri"] ?? "";
        return requested.startsWith("/") && !requested.startsWith("/__staging-assets/")
          && req.headers.accept?.includes("text/html") ? redirect(base + "/sign-in") : send(401);
      }
      if (path === base + "/invite.js") {
        let setup = 'const value = location.hash.slice(1); const field = document.querySelector("#link-code"); if (field && /^[0-9a-f]{64}$/.test(value)) { field.value=value; field.closest("label").hidden=true; history.replaceState(null,"",location.pathname); }';
        if (game) {
          const serverId = await game.serverId().catch(() => "");
          if (serverId) setup += `const savedKey = "avenlab-social-profile-v1:" + ${JSON.stringify(serverId)};
            const deviceField = document.querySelector('[name="deviceToken"]');
            if (deviceField) deviceField.form.addEventListener("submit", () => {
              try {
                const saved = JSON.parse(sessionStorage.getItem(savedKey + ":tab") ?? localStorage.getItem(savedKey) ?? "null");
                if (typeof saved?.token === "string" && /^[a-f0-9]{64}$/i.test(saved.token)) deviceField.value = saved.token;
              } catch {}
            });`;
        }
        return send(200, setup, { "Content-Type": "text/javascript; charset=utf-8" });
      }
      if (path === base + "/password.js") return send(200, `
        for (const toggle of document.querySelectorAll(".password-toggle")) {
          const password = document.getElementById(toggle.getAttribute("aria-controls"));
          if (!password) continue;
          toggle.hidden = false;
          const setVisible = visible => {
            password.type = visible ? "text" : "password";
            toggle.textContent = visible ? "Hide password" : "Show password";
          };
          toggle.addEventListener("click", () => setVisible(password.type === "password"));
          window.addEventListener("pageshow", () => setVisible(false));
        }`, { "Content-Type": "text/javascript; charset=utf-8" });
      if (path.startsWith(base + "/entry/")) {
        const name = path.slice((base + "/entry/").length);
        const type = entryAssets.get(name);
        if (!type) return send(404);
        const file = new URL(name, entryImages);
        try {
          const info = await stat(file);
          const etag = `W/"${info.size}-${Math.trunc(info.mtimeMs)}"`;
          const headers = { "Content-Type": type, "Cache-Control": name === GARAGE_ENTRY_POSTER ? "public, max-age=31536000, immutable" : "public, max-age=300", ETag: etag };
          if (req.headers["if-none-match"] === etag) return send(304, "", headers);
          return send(200, await readFile(file), headers);
        } catch { return send(404); }
      }
      if (path === base + "/theme.js") {
        try { return send(200, paletteScript(), { "Content-Type": "text/javascript; charset=utf-8" }); }
        catch { return send(503); }
      }
      if (path === base + "/sign-in") return viewer ? redirect("/") : send(200, signInPage());
      if (path === base + "/session") return viewer
        ? json(200, { email: viewer.email, admin: Boolean(viewer.admin), hasMfa: Boolean(viewer.has_mfa) })
        : json(401, { error: "Sign in required." });
      if (path === base + "/enroll") return send(200, signInPage("", true));
      if (path === base + "/forgot-password") return send(200, forgotPasswordPage());
      if (path === base + "/reset") return send(200, resetPage());
      if (path === base + "/account") return viewer ? send(200, page("Account", securityPage(viewer))) : redirect(base + "/sign-in");
      if (path === base + "/testers") return send(viewer?.admin ? 200 : 403, testerPage(viewer));
      return send(404);
    }
    if (req.method !== "POST") return send(405);
    if (req.headers.origin !== origin) return send(403, page("Form blocked",
      `<a href="${base}/sign-in">Return to sign-in</a>`,
      "Open the portal or your original invitation link directly in your browser and try again."));
    const client = req.headers["x-alpha-client"] ?? req.socket.remoteAddress;
    if (!admit(client)) return send(429, page("Try again shortly", `${backToSignIn}`), { "Retry-After": "60" });
    active++;
    let resetInput;
    try {
      const value = await readForm(req);
      if (path === base + "/sign-in") {
        const result = await accounts.beginSignIn(value("email"), value("password"));
        if (result.locked) return factorRateLimited();
        return result.challenge ? send(200, factorPage(result.challenge)) : redirect("/", result.session);
      }
      if (path === base + "/sign-in/code") {
        const result = accounts.completeSignIn(value("challenge"), value("code").trim());
        if (result.session) return redirect("/", result.session);
        if (result.locked) return factorRateLimited();
        if (result.challenge) return send(400, factorPage(result.challenge, "The authentication code is incorrect."));
        return send(400, signInPage("The verification step ended. Enter your email and password to try again."));
      }
      if (path === base + "/enroll") return redirect(game ? "/" : base + "/account",
        await accounts.enroll(value("email"), value("invite").trim(), value("password"), value("deviceToken")));
      if (path === base + "/forgot-password") {
        accounts.requestPasswordReset(value("email"));
        return send(200, page("Request received", "<p>If the email matches a staging account, the staging operator can send you a private reset link.</p>"
          + `${backToSignIn}`, "", Boolean(game)));
      }
      if (game && path === base + "/reset/verify") {
        const code = value("reset").trim();
        return send(200, resetPage("", { ...accounts.inspectGamePasswordReset(value("email"), code), code }));
      }
      if (path === base + "/reset") {
        resetInput = { email: value("email"), code: value("reset").trim() };
        await accounts.resetPassword(resetInput.email, resetInput.code, value("password"), value("code").trim());
        return game ? send(200, page("Password updated", "<p>Use your new password to sign in. If you still have an invitation to accept, open the invite first.</p>"
          + `${backToSignIn}`, "", true), {
          "Set-Cookie": `${cookieName}=; Max-Age=0; ${cookieFlags}`,
        }) : redirect(base + "/sign-in", "");
      }
      if (!viewer) return wantsJson ? json(401, { error: "Sign in required." }) : send(403);
      if (path === base + "/account/email-request") {
        const result = await accounts.requestEmailChange(viewer, value("newEmail"), value("password"));
        return wantsJson ? json(200, result) : send(200, page("Account", securityPage(viewer), result.message));
      }
      if (path === base + "/account/delete-request") {
        const result = await accounts.requestDeletion(viewer, value("confirmEmail"), value("password"));
        return wantsJson ? json(200, result) : send(200, page("Account", securityPage(viewer), result.message));
      }
      if (path === base + "/sign-out") {
        accounts.end(viewer);
        if (game) await game.disconnect(viewer.game_profile);
        return redirect(base + "/sign-in", "");
      }
      if (path === base + "/mfa/start") {
        const seed = await accounts.beginMfa(viewer, value("password"));
        return send(200, page("Set up two-factor authentication",
          `<p>Add this setup key to your authenticator app.</p><p><code>${seed}</code></p>
${form("mfa/enable", '<label>Six-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label>', "Enable two-factor authentication")}`));
      }
      if (path === base + "/mfa/enable") {
        const codes = accounts.enableMfa(viewer, value("code"));
        return send(200, page("Recovery codes", '<p>Keep these one-use codes somewhere safe.</p><ul>'
          + codes.map(code => `<li><code>${code}</code></li>`).join("") + `</ul><a href="${base}/account">Done</a>`));
      }
      if (!viewer.admin) return wantsJson ? json(403, { error: "Only alpha administrators can invite testers." }) : send(403);
      if (path === base + "/testers/invite") {
        const { email, code } = accounts.issueInvite(value("email"), false, value("gameLogin"));
        const url = origin + base + "/enroll#" + code;
        if (mailInvite) {
          try {
            await mailInvite(email, url);
            return wantsJson ? json(200, { email, sent: true }) : send(200, testerPage(viewer, "Invitation sent."));
          } catch { /* The administrator can share the invitation link manually. */ }
        }
        return wantsJson ? json(200, { email, sent: false, url })
          : send(200, testerPage(viewer, mailInvite ? "Email delivery failed." : "Invitation created.",
            `<label>Invitation link<input value="${escape(url)}" readonly></label>`));
      }
      if (path === base + "/testers/revoke") {
        const profile = accounts.revoke(value("email"));
        if (game && profile) await game.disconnect(profile);
        return redirect(base + "/testers");
      }
      if (path === base + "/testers/restore") { accounts.restore(value("email")); return redirect(base + "/testers"); }
      return send(404);
    } catch (error) {
      // Database, filesystem and mail failures are private to the operator.
      const message = error?.name === "Error" && !error.code ? error.message : "The request could not be completed.";
      if (path === base + "/sign-in" || path === base + "/enroll")
        return send(400, signInPage(message, path.endsWith("/enroll")));
      if (path === base + "/forgot-password") return send(400, forgotPasswordPage(message));
      if (path === base + "/reset" || path === base + "/reset/verify") {
        let verification;
        if (game && resetInput) {
          try {
            verification = { ...accounts.inspectGamePasswordReset(resetInput.email, resetInput.code), code: resetInput.code };
          } catch {}
        }
        return send(400, resetPage(message, verification));
      }
      if (wantsJson) return json(400, { error: message });
      if (path?.startsWith(base + "/testers/")) return send(400, testerPage(viewer, message));
      return send(400, page("Account", viewer ? securityPage(viewer) : "", message));
    } finally { active--; }
  });
}

function sendmail(program, sender) {
  if (!isAbsolute(program)) throw Error("Use an absolute sendmail executable path.");
  const from = emailAddress(sender);
  return (recipient, subject, body) => new Promise((resolveMail, reject) => {
    const child = spawn(program, ["-t", "-i"], { stdio: ["pipe", "ignore", "ignore"], timeout: 8000 });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolveMail() : reject(Error("Mail delivery failed.")));
    child.stdin.on("error", reject);
    child.stdin.end(`From: ${from}\nTo: ${recipient}\nSubject: ${subject}\nContent-Type: text/plain; charset=utf-8\n\n${body}\n`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { AVENSKY_ALPHA_STATE, AVENSKY_ALPHA_KEY, AVENSKY_ALPHA_ORIGIN, AVENSKY_ALPHA_SENDMAIL, AVENSKY_ALPHA_SENDER,
    AVENSKY_ALPHA_GAME_KEY } = process.env;
  const origin = AVENSKY_ALPHA_ORIGIN || "https://staging.avensky.com";
  if (origin !== "https://staging.avensky.com" || !AVENSKY_ALPHA_STATE || !isAbsolute(AVENSKY_ALPHA_STATE)
    || !/^[0-9a-f]{64}$/i.test(AVENSKY_ALPHA_KEY ?? "")) throw Error("Configure the staging origin, state directory and encryption key.");
  process.umask(0o077);
  const game = AVENSKY_ALPHA_GAME_KEY ? gameBridge(AVENSKY_ALPHA_GAME_KEY) : undefined;
  const accounts = testerAccounts(join(AVENSKY_ALPHA_STATE, game ? "game-access.sqlite3" : "testers.sqlite3"),
    Buffer.from(AVENSKY_ALPHA_KEY, "hex"), game);
  const [command, email, option, optionValue, ...extra] = process.argv.slice(2);
  const configuredMail = () => AVENSKY_ALPHA_SENDMAIL ? sendmail(AVENSKY_ALPHA_SENDMAIL, AVENSKY_ALPHA_SENDER ?? "") : undefined;
  if (command === undefined) {
    const mail = game ? undefined : configuredMail();
    const mailInvite = mail && ((recipient, url) => mail(recipient, "Avensky alpha invitation", `${url}\n\nThis invitation expires in three days.`));
    createPortal({ origin, accounts, mailInvite, game }).listen(9061, "127.0.0.1");
    if (game) gameSocketGate({ accounts, key: AVENSKY_ALPHA_GAME_KEY, origin }).listen(9062, "127.0.0.1");
  } else {
    try {
      if (command === "invite-admin" && email && !extra.length
          && (!option || (option === "--game-login" && optionValue))) {
        const { code } = accounts.issueInvite(email, true, optionValue);
        process.stdout.write(origin + base + "/enroll#" + code + "\n");
      } else if (command === "reset-password" && email && (!option || option === "--email") && !optionValue && !extra.length) {
        const mail = option === "--email" ? configuredMail() : undefined;
        if (option === "--email" && !mail) throw Error("Configure the portal mail relay before using --email.");
        const reset = await accounts.issuePasswordReset(email);
        const url = origin + base + "/reset#" + reset.code;
        if (option === "--email") {
          await mail(reset.email, "Reset your Avensky alpha password", `${url}\n\nThis one-use link expires in 30 minutes.`);
          process.stdout.write("Password reset email submitted to the mail relay.\n");
        } else {
          process.stdout.write(url + "\n");
        }
      } else {
        throw Error("Use invite-admin EMAIL [--game-login LOGIN] or reset-password EMAIL [--email], or start the portal without arguments.");
      }
    } finally {
      accounts.close();
    }
  }
}
