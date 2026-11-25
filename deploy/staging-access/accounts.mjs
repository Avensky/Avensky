import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { LOGIN_FAILED } from "./game-bridge.mjs";

const derive = promisify(scrypt);
const hash = value => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("hex");
const now = () => Math.floor(Date.now() / 1000);
const SESSION_AGE = 12 * 60 * 60;
const INVITE_AGE = 3 * 24 * 60 * 60;
const RESET_AGE = 30 * 60;
const SIGN_IN_AGE = 5 * 60;
const SIGN_IN_ATTEMPTS = 5;
const resetDenied = () => Error("The reset link or authentication code is invalid or expired.");

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
    CREATE TABLE IF NOT EXISTS sign_in_challenges (
      email TEXT PRIMARY KEY REFERENCES testers(email), digest TEXT NOT NULL UNIQUE,
      expires INTEGER NOT NULL, attempts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      email TEXT PRIMARY KEY REFERENCES testers(email), digest TEXT NOT NULL, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_password_resets (
      email TEXT PRIMARY KEY, digest TEXT NOT NULL, expires INTEGER NOT NULL,
      profile_id TEXT NOT NULL, login TEXT NOT NULL, attempts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      email TEXT PRIMARY KEY, requested_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_profiles (
      email TEXT PRIMARY KEY REFERENCES testers(email), profile_id TEXT NOT NULL UNIQUE, login TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_email_requests (
      email TEXT PRIMARY KEY REFERENCES testers(email), new_email TEXT NOT NULL, requested_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profile_deletion_requests (
      email TEXT PRIMARY KEY REFERENCES testers(email), requested_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invite_game_logins (
      digest TEXT PRIMARY KEY REFERENCES invitations(digest) ON DELETE CASCADE, login TEXT NOT NULL
    );
  `);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const all = sql => db.prepare(sql).all();
  const tester = email => get("SELECT * FROM testers WHERE email = ?", email);
  const gameProfile = email => get("SELECT profile_id, login FROM game_profiles WHERE email = ?", email);
  const credentialOperations = new Set();
  async function withCredentials(email, task) {
    const login = (game && resetIdentity(email)?.login) || email;
    if (credentialOperations.has(login)) throw Error("Another account request is in progress. Try again shortly.");
    credentialOperations.add(login);
    try { return await task(); }
    finally { credentialOperations.delete(login); }
  }
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
      if (!profile || record.revoked) return false;
      try { return await game.authenticate(profile.login, password) === profile.profile_id; }
      catch (error) {
        if (error.message !== LOGIN_FAILED) throw error;
        return false;
      }
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
  function resetIdentity(email) {
    const record = tester(email);
    if (record) return record.revoked ? undefined : gameProfile(email);
    const invite = get(`SELECT g.login FROM invitations i JOIN invite_game_logins g ON g.digest = i.digest
      WHERE i.email = ? AND i.expires > ?`, email, now());
    return { login: invite?.login ?? email };
  }
  function pendingGameReset(email, code) {
    if (!/^[0-9a-f]{64}$/.test(code)) throw resetDenied();
    const reset = get(`SELECT * FROM game_password_resets
      WHERE email = ? AND digest = ? AND expires > ? AND attempts > 0`, email, hash(code), now());
    const identity = resetIdentity(email);
    if (!reset || reset.login !== identity?.login ||
        (identity.profile_id && identity.profile_id !== reset.profile_id)) throw resetDenied();
    const owner = get("SELECT email FROM game_profiles WHERE profile_id = ?", reset.profile_id);
    if (owner && owner.email !== email) throw resetDenied();
    return reset;
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
    async requestEmailChange(viewer, raw, password) {
      const newEmail = emailAddress(raw);
      return withCredentials(viewer.email, async () => {
        if (newEmail === viewer.email) throw Error("Choose a different email address.");
        if (tester(newEmail)) throw Error("That email is already registered.");
        if (!await validPassword(tester(viewer.email), password)) throw Error("Verify your current password.");
        run("INSERT INTO account_email_requests(email,new_email,requested_at) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET new_email=excluded.new_email,requested_at=excluded.requested_at",
          viewer.email, newEmail, now());
        return { message: "Email change requested. Your current email remains active until the operator verifies the change." };
      });
    },
    async requestDeletion(viewer, confirmation, password) {
      return withCredentials(viewer.email, async () => {
        if (confirmation !== viewer.email) throw Error("Enter your account email to confirm the request.");
        if (!await validPassword(tester(viewer.email), password)) throw Error("Verify your current password.");
        run("INSERT INTO profile_deletion_requests(email,requested_at) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET requested_at=excluded.requested_at",
          viewer.email, now());
        return { message: "Profile deletion requested for operator review. Nothing has been deleted." };
      });
    },
    issueInvite(raw, admin = false, gameLogin = "") {
      const email = emailAddress(raw);
      const login = gameLogin.trim();
      if (login && (!game || !/^[a-z0-9_.+@-]{3,254}$/i.test(login)))
        throw Error("Enter a valid existing game login for this invitation.");
      if (tester(email)) throw Error("This email already has a tester account.");
      const code = token();
      const digest = hash(code);
      transaction(() => {
        run("DELETE FROM invitations WHERE expires <= ? OR email = ?", now(), email);
        if (get("SELECT count(*) AS count FROM invitations").count >= 250)
          throw Error("The pending invitation limit has been reached.");
        run("INSERT INTO invitations VALUES (?, ?, ?, ?)", digest, email, Number(admin), now() + INVITE_AGE);
        if (login) run("INSERT INTO invite_game_logins VALUES (?, ?)", digest, login);
      });
      return { email, code };
    },
    async enroll(raw, code, password, savedDevice) {
      const email = emailAddress(raw);
      return withCredentials(email, async () => {
        if (!/^[0-9a-f]{64}$/.test(code)) throw Error("Enter the invitation code from your email.");
        const digest = hash(code);
        const invitation = () => get(`SELECT i.*, g.login AS game_login
          FROM invitations i LEFT JOIN invite_game_logins g ON g.digest = i.digest
          WHERE i.digest = ? AND i.email = ? AND i.expires > ?`, digest, email, now());
        const pending = invitation();
        if (!pending) throw Error("The invitation is invalid or expired.");
        let link;
        let salt = "", passwordDigest = "";
        if (game) {
          const login = pending.game_login || email;
          const deviceToken = /^[a-f0-9]{64}$/i.test(savedDevice ?? "") ? savedDevice : undefined;
          const profileId = pending.game_login
            ? await game.authenticate(login, password)
            : await game.enroll(email, password, deviceToken);
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
      });
    },
    async beginSignIn(raw, password) {
      const email = emailAddress(raw);
      return withCredentials(email, async () => {
        const record = tester(email);
        const denied = () => Error("The email or password is incorrect, or your staging invitation has not been accepted.");
        if (!await validPassword(record, password)) throw denied();
        return transaction(() => {
          const current = tester(email);
          if (!current || current.revoked || current.password !== record.password) throw denied();
          if (!current.mfa) return { session: session(email) };
          const challenge = token();
          run("DELETE FROM sign_in_challenges WHERE expires <= ?", now());
          const pending = get(`INSERT INTO sign_in_challenges (email, digest, expires, attempts) VALUES (?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET digest = excluded.digest RETURNING attempts`,
            email, hash(challenge), now() + SIGN_IN_AGE, SIGN_IN_ATTEMPTS);
          return pending.attempts ? { challenge } : { locked: true };
        });
      });
    },
    completeSignIn(challenge, code) {
      if (!/^[0-9a-f]{64}$/.test(challenge)) return {};
      const digest = hash(challenge);
      return transaction(() => {
        const pending = get("SELECT email, attempts FROM sign_in_challenges WHERE digest = ? AND expires > ?", digest, now());
        if (!pending) return {};
        if (!pending.attempts) return { locked: true };
        const record = tester(pending.email);
        if (record?.mfa && !record.revoked) {
          if (verifySecondFactor(record, code)) {
            run("DELETE FROM sign_in_challenges WHERE digest = ?", digest);
            return { session: session(record.email) };
          }
          run("UPDATE sign_in_challenges SET attempts = attempts - 1 WHERE digest = ?", digest);
          return pending.attempts > 1 ? { challenge } : { locked: true };
        }
        run("DELETE FROM sign_in_challenges WHERE digest = ?", digest);
        return {};
      });
    },
    requestPasswordReset(raw) {
      const email = emailAddress(raw);
      transaction(() => {
        run("DELETE FROM password_reset_requests WHERE requested_at <= ?", now() - INVITE_AGE);
        run("INSERT OR IGNORE INTO password_reset_requests VALUES (?, ?)", email, now());
        run(`DELETE FROM password_reset_requests WHERE email IN
          (SELECT email FROM password_reset_requests ORDER BY requested_at DESC, rowid DESC LIMIT -1 OFFSET 250)`);
      });
    },
    async issuePasswordReset(raw) {
      const email = emailAddress(raw);
      const code = token();
      if (game) {
        const identity = resetIdentity(email);
        if (!identity) throw Error("This email has no active staging access.");
        const profileId = await game.recoveryProfile(identity.login);
        transaction(() => {
          const current = resetIdentity(email);
          const owner = get("SELECT email FROM game_profiles WHERE profile_id = ?", profileId);
          if (current?.login !== identity.login || (current.profile_id && current.profile_id !== profileId) ||
              (owner && owner.email !== email)) throw Error("The account does not match this email.");
          run("DELETE FROM game_password_resets WHERE expires <= ? OR profile_id = ?", now(), profileId);
          run("INSERT OR REPLACE INTO game_password_resets VALUES (?, ?, ?, ?, ?, ?)",
            email, hash(code), now() + RESET_AGE, profileId, current.login, SIGN_IN_ATTEMPTS);
          run("DELETE FROM password_reset_requests WHERE email = ?", email);
        });
        return { email, code };
      }
      transaction(() => {
        const record = tester(email);
        if (!record || record.revoked) throw Error("There is no active alpha portal account for that email.");
        run("DELETE FROM password_resets WHERE expires <= ?", now());
        run("INSERT OR REPLACE INTO password_resets (email, digest, expires) VALUES (?, ?, ?)",
          email, hash(code), now() + RESET_AGE);
        run("DELETE FROM password_reset_requests WHERE email = ?", email);
      });
      return { email, code };
    },
    inspectGamePasswordReset(raw, code) {
      const email = emailAddress(raw);
      pendingGameReset(email, code);
      return { email, needsFactor: Boolean(tester(email)?.mfa) };
    },
    async resetPassword(raw, code, password, factor) {
      const email = emailAddress(raw);
      if (game) return withCredentials(email, async () => {
        const length = [...password].length;
        if (length < 15 || length > 128 || Buffer.byteLength(password) > 512)
          throw Error("Choose a password with 15–128 characters.");
        const reset = transaction(() => {
          const pending = pendingGameReset(email, code);
          const record = tester(email);
          if (record?.mfa && !verifySecondFactor(record, factor)) {
            run("UPDATE game_password_resets SET attempts = attempts - 1 WHERE email = ?", email);
            return;
          }
          run("DELETE FROM game_password_resets WHERE email = ?", email);
          run("DELETE FROM sessions WHERE email = ?", email);
          run("DELETE FROM sign_in_challenges WHERE email = ?", email);
          return pending;
        });
        if (!reset) throw resetDenied();
        await game.resetPassword(reset.profile_id, reset.login, password);
      });
      if (!/^[0-9a-f]{64}$/.test(code)) throw resetDenied();
      const digest = hash(code);
      const pending = () => get("SELECT 1 FROM password_resets WHERE email = ? AND digest = ? AND expires > ?", email, digest, now());
      if (!pending()) throw resetDenied();
      const [salt, passwordDigest] = await newPasswordRecord(password);
      transaction(() => {
        const record = tester(email);
        if (!pending() || !record || record.revoked || !verifySecondFactor(record, factor)) throw resetDenied();
        run("UPDATE testers SET salt = ?, password = ? WHERE email = ?", salt, passwordDigest, email);
        run("DELETE FROM sessions WHERE email = ?", email);
        run("DELETE FROM sign_in_challenges WHERE email = ?", email);
        run("DELETE FROM password_resets WHERE email = ?", email);
      });
    },
    list() {
      return {
        testers: all("SELECT email, admin, revoked, mfa IS NOT NULL AS has_mfa FROM testers ORDER BY email"),
        invites: db.prepare("SELECT email, expires FROM invitations WHERE expires > ? ORDER BY email").all(now()),
        resetRequests: db.prepare("SELECT email FROM password_reset_requests WHERE requested_at > ? ORDER BY requested_at DESC").all(now() - INVITE_AGE),
        emailChanges: all("SELECT email,new_email,requested_at FROM account_email_requests ORDER BY requested_at DESC"),
        deletionRequests: all("SELECT email,requested_at FROM profile_deletion_requests ORDER BY requested_at DESC"),
      };
    },
    revoke(raw) {
      const email = emailAddress(raw);
      transaction(() => {
        if (tester(email)?.admin) throw Error("Manage administrator access through the server operator.");
        run("DELETE FROM invitations WHERE email = ?", email);
        run("DELETE FROM password_resets WHERE email = ?", email);
        run("DELETE FROM game_password_resets WHERE email = ?", email);
        run("DELETE FROM sessions WHERE email = ?", email);
        run("DELETE FROM sign_in_challenges WHERE email = ?", email);
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
