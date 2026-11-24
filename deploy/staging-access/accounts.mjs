import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const hash = value => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("hex");
const now = () => Math.floor(Date.now() / 1000);
const SESSION_AGE = 12 * 60 * 60;
const INVITE_AGE = 3 * 24 * 60 * 60;
const RESET_AGE = 30 * 60;

export function emailAddress(value) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9][a-z0-9._+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email))
    throw Error("Enter a valid email address.");
  return email;
}

function passwordHash(password, salt) {
  return derive(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
}

async function newPasswordRecord(password) {
  if (password.length < 15 || password.length > 128) throw Error("Choose a password with 15–128 characters.");
  const salt = randomBytes(16);
  const digest = await passwordHash(password, salt);
  return [salt.toString("hex"), digest.toString("hex")];
}

const secretAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(secret) {
  let value = 0, bits = 0, result = "";
  for (const byte of secret) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += secretAlphabet[(value >>> bits) & 31];
    }
  }
  return result;
}

export function totp(secret, step) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", secret).update(bytes).digest();
  return String((mac.readUInt32BE(mac.at(-1) & 15) & 0x7fffffff) % 1000000).padStart(6, "0");
}

function matchingStep(secret, code, lastStep) {
  if (!/^\d{6}$/.test(code)) return undefined;
  const current = Math.floor(now() / 30);
  return [current, current - 1, current + 1].find(step =>
    step > lastStep && timingSafeEqual(Buffer.from(code), Buffer.from(totp(secret, step))));
}

export function testerAccounts(path, key, game) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error("Set a 32-byte alpha access encryption key.");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS testers (
      email TEXT PRIMARY KEY, salt TEXT NOT NULL, password TEXT NOT NULL,
      admin INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0,
      mfa TEXT, last_step INTEGER NOT NULL DEFAULT -1
    );
    CREATE TABLE IF NOT EXISTS invitations (
      digest TEXT PRIMARY KEY, email TEXT NOT NULL, admin INTEGER NOT NULL, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      digest TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES testers(email),
      expires INTEGER NOT NULL, pending_mfa TEXT, pending_until INTEGER
    );
    CREATE TABLE IF NOT EXISTS recovery (
      email TEXT NOT NULL REFERENCES testers(email), digest TEXT NOT NULL, PRIMARY KEY(email, digest)
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      email TEXT PRIMARY KEY REFERENCES testers(email), digest TEXT NOT NULL, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_profiles (
      email TEXT PRIMARY KEY REFERENCES testers(email), profile_id TEXT NOT NULL UNIQUE, login TEXT NOT NULL
    );
  `);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const all = sql => db.prepare(sql).all();
  const tester = email => get("SELECT * FROM testers WHERE email = ?", email);
  const gameProfile = email => get("SELECT profile_id, login FROM game_profiles WHERE email = ?", email);
  function transaction(task) {
    db.exec("BEGIN IMMEDIATE");
    try { const result = task(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function seal(secret) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    return Buffer.concat([iv, cipher.update(secret), cipher.final(), cipher.getAuthTag()]).toString("hex");
  }
  function unseal(record) {
    const bytes = Buffer.from(record, "hex");
    const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]);
  }
  function session(email) {
    run("DELETE FROM sessions WHERE expires <= ?", now());
    run("DELETE FROM sessions WHERE email = ? AND digest NOT IN (SELECT digest FROM sessions WHERE email = ? ORDER BY expires DESC LIMIT 7)", email, email);
    const value = token();
    run("INSERT INTO sessions (digest, email, expires) VALUES (?, ?, ?)", hash(value), email, now() + SESSION_AGE);
    return value;
  }
  async function validPassword(record, password) {
    if (typeof password !== "string" || password.length > 256) return false;
    if (game) {
      const profile = record && gameProfile(record.email);
      return Boolean(profile && !record.revoked && await game.authenticate(profile.login, password) === profile.profile_id);
    }
    const result = await passwordHash(password, Buffer.from(record?.salt ?? "00".repeat(16), "hex"));
    const same = timingSafeEqual(result, Buffer.from(record?.password ?? "00".repeat(32), "hex"));
    return same && Boolean(record && !record.revoked);
  }
  function verifySecondFactor(record, code) {
    if (!record.mfa) return true;
    if (/^[0-9a-f]{32}$/.test(code)) {
      return run("DELETE FROM recovery WHERE email = ? AND digest = ?", record.email, hash(code)).changes === 1;
    }
    const step = matchingStep(unseal(record.mfa), code, record.last_step);
    return step !== undefined
      && run("UPDATE testers SET last_step = ? WHERE email = ? AND last_step < ?", step, record.email, step).changes === 1;
  }
  return {
    close: () => db.close(),
    viewer(value) {
      if (!/^[0-9a-f]{64}$/.test(value)) return undefined;
      const viewer = get(`SELECT t.email, t.admin, t.mfa IS NOT NULL AS has_mfa, s.digest, s.expires,
        g.profile_id AS game_profile
        FROM sessions s JOIN testers t ON t.email = s.email
        LEFT JOIN game_profiles g ON g.email = t.email
        WHERE s.digest = ? AND s.expires > ? AND t.revoked = 0`, hash(value), now());
      return game && !viewer?.game_profile ? undefined : viewer;
    },
    end(viewer) { run("DELETE FROM sessions WHERE digest = ?", viewer.digest); },
    issueInvite(raw, admin = false) {
      const email = emailAddress(raw);
      if (tester(email)) throw Error("This email already has a tester account.");
      const code = token();
      transaction(() => {
        run("DELETE FROM invitations WHERE expires <= ? OR email = ?", now(), email);
        if (get("SELECT count(*) AS count FROM invitations").count >= 250)
          throw Error("The pending invitation limit has been reached.");
        run("INSERT INTO invitations VALUES (?, ?, ?, ?)", hash(code), email, Number(admin), now() + INVITE_AGE);
      });
      return { email, code };
    },
    async enroll(raw, code, password, gameAccount = {}) {
      const email = emailAddress(raw);
      if (!/^[0-9a-f]{64}$/.test(code)) throw Error("Enter the invitation code from your email.");
      const digest = hash(code);
      const invitation = () => get("SELECT * FROM invitations WHERE digest = ? AND email = ? AND expires > ?", digest, email, now());
      if (!invitation()) throw Error("The invitation is invalid or expired.");
      let link;
      let salt = "", passwordDigest = "";
      if (game) {
        const existing = gameAccount.intent === "existing";
        const device = gameAccount.intent === "device";
        if (!existing && !device && gameAccount.intent !== "new") throw Error("Choose how to set up your game account.");
        if (device && !/^[a-f0-9]{64}$/i.test(gameAccount.deviceToken ?? ""))
          throw Error("Open the invitation in the original browser that holds your guest profile.");
        const login = existing ? gameAccount.login?.trim() || email : email;
        const profileId = await game.authenticate(login, password, existing ? undefined : device ? "Guest driver" : gameAccount.name,
          device ? gameAccount.deviceToken : undefined);
        link = { profileId, login };
      } else {
        [salt, passwordDigest] = await newPasswordRecord(password);
      }
      return transaction(() => {
        const invite = invitation();
        if (!invite || tester(email)) throw Error("The invitation is invalid or expired.");
        if (link && get("SELECT 1 FROM game_profiles WHERE profile_id = ?", link.profileId))
          throw Error("This game account already has staging access.");
        run("INSERT INTO testers (email,salt,password,admin) VALUES (?,?,?,?)", email, salt, passwordDigest, invite.admin);
        if (link) run("INSERT INTO game_profiles (email, profile_id, login) VALUES (?, ?, ?)", email, link.profileId, link.login);
        run("DELETE FROM invitations WHERE digest = ?", digest);
        return session(email);
      });
    },
    async logIn(raw, password, code) {
      const email = emailAddress(raw);
      const record = tester(email);
      const denied = () => Error("The email, password, or authentication code is incorrect.");
      if (!await validPassword(record, password)) throw denied();
      return transaction(() => {
        const current = tester(email);
        if (!current || current.revoked || current.password !== record.password
          || !verifySecondFactor(current, code)) throw denied();
        return session(email);
      });
    },
    issuePasswordReset(raw) {
      if (game) throw Error("This portal uses the game account password.");
      const email = emailAddress(raw);
      const code = token();
      transaction(() => {
        const record = tester(email);
        if (!record || record.revoked) throw Error("There is no active alpha portal account for that email.");
        run("DELETE FROM password_resets WHERE expires <= ?", now());
        run("INSERT OR REPLACE INTO password_resets (email, digest, expires) VALUES (?, ?, ?)",
          email, hash(code), now() + RESET_AGE);
      });
      return { email, code };
    },
    async resetPassword(raw, code, password, factor) {
      if (game) throw Error("This portal uses the game account password.");
      const email = emailAddress(raw);
      const denied = () => Error("The reset link or authentication code is invalid or expired.");
      if (!/^[0-9a-f]{64}$/.test(code)) throw denied();
      const digest = hash(code);
      const pending = () => get("SELECT 1 FROM password_resets WHERE email = ? AND digest = ? AND expires > ?", email, digest, now());
      if (!pending()) throw denied();
      const [salt, passwordDigest] = await newPasswordRecord(password);
      transaction(() => {
        const record = tester(email);
        if (!pending() || !record || record.revoked || !verifySecondFactor(record, factor)) throw denied();
        run("UPDATE testers SET salt = ?, password = ? WHERE email = ?", salt, passwordDigest, email);
        run("DELETE FROM sessions WHERE email = ?", email);
        run("DELETE FROM password_resets WHERE email = ?", email);
      });
    },
    list() {
      return {
        testers: all("SELECT email, admin, revoked, mfa IS NOT NULL AS has_mfa FROM testers ORDER BY email"),
        invites: db.prepare("SELECT email, expires FROM invitations WHERE expires > ? ORDER BY email").all(now()),
      };
    },
    revoke(raw) {
      const email = emailAddress(raw);
      transaction(() => {
        if (tester(email)?.admin) throw Error("Manage administrator access through the server operator.");
        run("DELETE FROM invitations WHERE email = ?", email);
        run("DELETE FROM password_resets WHERE email = ?", email);
        run("DELETE FROM sessions WHERE email = ?", email);
        run("UPDATE testers SET revoked = 1 WHERE email = ?", email);
      });
      return gameProfile(email)?.profile_id;
    },
    restore(raw) {
      const email = emailAddress(raw);
      run("UPDATE testers SET revoked = 0 WHERE email = ? AND admin = 0", email);
    },
    async beginMfa(viewer, password) {
      if (viewer.has_mfa || !await validPassword(tester(viewer.email), password))
        throw Error("Verify your password to set up two-factor authentication.");
      const secret = randomBytes(20);
      const updated = run("UPDATE sessions SET pending_mfa = ?, pending_until = ? WHERE digest = ? AND expires > ?",
        seal(secret), now() + 600, viewer.digest, now());
      if (!updated.changes) throw Error("Sign in again to continue.");
      return base32(secret);
    },
    enableMfa(viewer, code) {
      return transaction(() => {
        const pending = get("SELECT pending_mfa FROM sessions WHERE digest = ? AND pending_until > ? AND expires > ?", viewer.digest, now(), now());
        const record = tester(viewer.email);
        if (!pending?.pending_mfa || !record || record.mfa || record.revoked)
          throw Error("Start two-factor setup again.");
        const step = matchingStep(unseal(pending.pending_mfa), code, -1);
        if (step === undefined) throw Error("The authentication code is incorrect.");
        run("UPDATE testers SET mfa = ?, last_step = ? WHERE email = ?", pending.pending_mfa, step, viewer.email);
        run("DELETE FROM sessions WHERE email = ? AND digest <> ?", viewer.email, viewer.digest);
        run("UPDATE sessions SET pending_mfa = NULL, pending_until = NULL WHERE digest = ?", viewer.digest);
        const codes = Array.from({ length: 8 }, () => randomBytes(16).toString("hex"));
        for (const recovery of codes) run("INSERT INTO recovery VALUES (?, ?)", viewer.email, hash(recovery));
        return codes;
      });
    },
  };
}

export { SESSION_AGE };
