import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { emailAddress, SESSION_AGE, testerAccounts } from "./accounts.mjs";

const base = "/__alpha";
const cookieName = "__Host-avensky-alpha";
const cookieFlags = "Path=/; HttpOnly; Secure; SameSite=Lax";
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const form = (action, contents, label) =>
  `<form method="post" action="${base}/${action}">${contents}<button>${label}</button></form>`;
const emailField = '<label>Email<input type="email" name="email" autocomplete="username" maxlength="254" required></label>';
const passwordField = (newPassword = false) =>
  `<label>Password<input type="password" name="password" autocomplete="${newPassword ? "new-password" : "current-password"}" maxlength="128" ${newPassword ? 'minlength="15"' : ""} required></label>`;
const codeField = '<label>Authenticator or recovery code<input name="code" autocomplete="one-time-code" maxlength="32"></label>';
const hideEmail = email => `<input type="hidden" name="email" value="${escape(email)}">`;

function page(title, contents, message = "") {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Avensky</title>
<style>
*{box-sizing:border-box}html{color-scheme:dark}body{margin:0;color:#f5f1fd;background:#100b1c;font:1rem system-ui;min-height:100dvh;display:grid;align-items:center}
main{width:min(calc(100% - 2rem),34rem);margin:2rem auto}h1{font-size:1.5rem;margin:0 0 1rem}
a{color:#e5d2fd}form,label,ul{display:grid;gap:.6rem}form{margin:.8rem 0}input,button{font:inherit;color:inherit;padding:.6rem .8rem;border:1px solid #927db0;border-radius:.3rem;background:#231933;min-height:44px;min-width:0}
button{color:#150c21;background:#dac2fb;font-weight:600;cursor:pointer}
ul{padding:0;list-style:none}li{border-top:1px solid #716084;padding:.5rem 0;overflow-wrap:anywhere}li form{display:inline}li button{min-height:2.5rem;padding:.35rem .55rem}
code{overflow-wrap:anywhere}nav{display:flex;flex-wrap:wrap;gap:.9rem}
</style><main><h1>${escape(title)}</h1>${message ? `<p role="alert">${escape(message)}</p>` : ""}${contents}</main></html>`;
}

function securityPage(viewer) {
  return `<p>${escape(viewer.email)}</p><nav><a href="/">Enter staging</a>${viewer.admin ? `<a href="${base}/testers">Alpha testers</a>` : ""}</nav>
${viewer.has_mfa ? "<p>Two-factor authentication is enabled.</p>"
    : `<h2>Two-factor authentication</h2>${form("mfa/start", passwordField(), "Set up authenticator")}`}
${form("sign-out", "", "Sign out")}`;
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

export function createPortal({ origin, accounts, mailInvite }) {
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
    return invite ? page("Sign up", form("enroll", emailField
      + '<label>Invitation code<input id="invite-code" name="invite" minlength="64" maxlength="64" required></label>'
      + passwordField(true), "Sign up") + `<a href="${base}/sign-in">Log in</a><script src="${base}/invite.js"></script>`, message)
      : page("Log in", form("sign-in", emailField + passwordField() + codeField, "Log in")
        + `<a href="${base}/enroll">Sign up</a>`, message);
  }

  function testerPage(viewer, message, extra = "") {
    if (!viewer?.admin) return page("Access denied", '<a href="/">Return to staging</a>');
    const { testers, invites } = accounts.list();
    return page("Alpha testers", `<nav><a href="/">Enter staging</a><a href="${base}/account">Account</a></nav>
${form("testers/invite", emailField, mailInvite ? "Send invite" : "Create invite")}${extra}
<h2>Testers</h2><ul>${testers.map(t => `<li>${escape(t.email)} · ${t.admin ? "Admin" : t.revoked ? "Revoked" : "Active"}${t.has_mfa ? " · 2FA" : ""}
${t.admin ? "" : form(t.revoked ? "testers/restore" : "testers/revoke", hideEmail(t.email), t.revoked ? "Grant access" : "Revoke access")}</li>`).join("")}</ul>
<h2>Pending invitations</h2><ul>${invites.map(i => `<li>${escape(i.email)} · Expires ${new Date(i.expires * 1000).toISOString().slice(0, 10)}
${form("testers/revoke", hideEmail(i.email), "Revoke invite")}</li>`).join("")}</ul>`, message);
  }

  return createServer({ requestTimeout: 12000, headersTimeout: 7000, maxHeaderSize: 8192 }, async (req, res) => {
    const path = req.url?.split("?")[0];
    const cookie = req.headers.cookie?.split(";").map(row => row.trim()).find(row => row.startsWith(cookieName + "="));
    const send = (status, body = "", headers = {}) => {
      res.writeHead(status, {
        "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        "X-Content-Type-Options": "nosniff", ...headers,
      });
      res.end(body);
    };
    const redirect = (location, value) => send(303, "", {
      Location: location,
      ...(value === undefined ? {} : {
        "Set-Cookie": `${cookieName}=${value}; Max-Age=${value ? SESSION_AGE : 0}; ${cookieFlags}`,
      }),
    });
    let viewer;
    try { viewer = accounts.viewer(cookie?.slice(cookieName.length + 1) ?? ""); }
    catch { return send(503); }
    if (req.method === "GET") {
      if (path === base + "/verify") {
        if (viewer) return send(204);
        const requested = req.headers["x-forwarded-uri"] ?? "";
        return requested.startsWith("/") && !requested.startsWith("/__staging-assets/")
          && req.headers.accept?.includes("text/html") ? redirect(base + "/sign-in") : send(401);
      }
      if (path === base + "/invite.js") return send(200,
        'const value = location.hash.slice(1); if (/^[0-9a-f]{64}$/.test(value)) { document.querySelector("#invite-code").value=value; history.replaceState(null,"",location.pathname); }',
        { "Content-Type": "text/javascript; charset=utf-8" });
      if (path === base + "/sign-in") return viewer ? redirect(base + "/account") : send(200, signInPage());
      if (path === base + "/enroll") return send(200, signInPage("", true));
      if (path === base + "/account") return viewer ? send(200, page("Account", securityPage(viewer))) : redirect(base + "/sign-in");
      if (path === base + "/testers") return send(viewer?.admin ? 200 : 403, testerPage(viewer));
      return send(404);
    }
    if (req.method !== "POST") return send(405);
    if (req.headers.origin !== origin) return send(403);
    const client = req.headers["x-alpha-client"] ?? req.socket.remoteAddress;
    if (!admit(client)) return send(429, page("Try again shortly", `<a href="${base}/sign-in">Log in</a>`), { "Retry-After": "60" });
    active++;
    try {
      const value = await readForm(req);
      if (path === base + "/sign-in") return redirect("/", await accounts.logIn(value("email"), value("password"), value("code").trim()));
      if (path === base + "/enroll") return redirect(base + "/account",
        await accounts.enroll(value("email"), value("invite").trim(), value("password")));
      if (!viewer) return send(403);
      if (path === base + "/sign-out") { accounts.end(viewer); return redirect(base + "/sign-in", ""); }
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
      if (!viewer.admin) return send(403);
      if (path === base + "/testers/invite") {
        const { email, code } = accounts.issueInvite(value("email"));
        const url = origin + base + "/enroll#" + code;
        if (mailInvite) {
          try { await mailInvite(email, url); return send(200, testerPage(viewer, "Invitation sent.")); }
          catch { /* A functioning link can be delivered manually if mail is down. */ }
        }
        return send(200, testerPage(viewer, mailInvite ? "Email delivery failed." : "Invitation created.",
          `<label>Invitation link<input value="${escape(url)}" readonly></label>`));
      }
      if (path === base + "/testers/revoke") { accounts.revoke(value("email")); return redirect(base + "/testers"); }
      if (path === base + "/testers/restore") { accounts.restore(value("email")); return redirect(base + "/testers"); }
      return send(404);
    } catch (error) {
      // Database, filesystem and mail failures are private to the operator.
      const message = error?.name === "Error" && !error.code ? error.message : "The request could not be completed.";
      if (path === base + "/sign-in" || path === base + "/enroll")
        return send(400, signInPage(message, path.endsWith("/enroll")));
      if (path?.startsWith(base + "/testers/")) return send(400, testerPage(viewer, message));
      return send(400, page("Account", viewer ? securityPage(viewer) : "", message));
    } finally { active--; }
  });
}

function sendmail(program, sender) {
  if (!isAbsolute(program)) throw Error("Use an absolute sendmail executable path.");
  const from = emailAddress(sender);
  return (recipient, url) => new Promise((resolveMail, reject) => {
    const child = spawn(program, ["-t", "-i"], { stdio: ["pipe", "ignore", "ignore"], timeout: 8000 });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolveMail() : reject(Error("Mail delivery failed.")));
    child.stdin.on("error", reject);
    child.stdin.end(`From: ${from}\nTo: ${recipient}\nSubject: Avensky alpha invitation\nContent-Type: text/plain; charset=utf-8\n\n${url}\n\nThis invitation expires in three days.\n`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { AVENSKY_ALPHA_STATE, AVENSKY_ALPHA_KEY, AVENSKY_ALPHA_ORIGIN, AVENSKY_ALPHA_SENDMAIL, AVENSKY_ALPHA_SENDER } = process.env;
  const origin = AVENSKY_ALPHA_ORIGIN || "https://staging.avensky.com";
  if (origin !== "https://staging.avensky.com" || !AVENSKY_ALPHA_STATE || !isAbsolute(AVENSKY_ALPHA_STATE)
    || !/^[0-9a-f]{64}$/i.test(AVENSKY_ALPHA_KEY ?? "")) throw Error("Configure the staging origin, state directory and encryption key.");
  process.umask(0o077);
  const accounts = testerAccounts(join(AVENSKY_ALPHA_STATE, "testers.sqlite3"), Buffer.from(AVENSKY_ALPHA_KEY, "hex"));
  if (process.argv[2] === "invite-admin") {
    const { code } = accounts.issueInvite(process.argv[3] ?? "", true);
    process.stdout.write(origin + base + "/enroll#" + code + "\n");
    accounts.close();
  } else if (process.argv.length === 2) {
    const mailInvite = AVENSKY_ALPHA_SENDMAIL ? sendmail(AVENSKY_ALPHA_SENDMAIL, AVENSKY_ALPHA_SENDER ?? "") : undefined;
    createPortal({ origin, accounts, mailInvite }).listen(9061, "127.0.0.1");
  } else throw Error("Use invite-admin with an email, or start the portal without arguments.");
}
