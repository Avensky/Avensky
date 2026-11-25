import { realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { initializeAccessTables } from "./accounts.mjs";

// Order follows foreign keys. SQL identifiers come only from this list and the local schema.
const tables = ["testers", "invitations", "sessions", "recovery", "sign_in_challenges",
  "password_resets", "game_password_resets", "password_reset_requests", "game_profiles",
  "account_email_requests", "profile_deletion_requests", "invite_game_logins"];

function gameDatabase(path, readOnly) {
  if (!path || !isAbsolute(path)) throw Error("Configure the absolute path to the staging game database.");
  const db = new DatabaseSync(realpathSync(path), { readOnly });
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
    db.prepare("SELECT id, document FROM player_profiles LIMIT 0").all();
    if (!db.prepare("SELECT 1 FROM social_state WHERE singleton=1").get())
      throw Error("Start the staging game to initialize its player database.");
    return db;
  } catch (error) { db.close(); throw error; }
}

export function checkSharedDatabase(path) {
  const db = gameDatabase(path, true);
  try {
    if (!db.prepare("SELECT 1 FROM staging_access_migration WHERE version=1").get())
      throw Error("Prepare the staging access tables before starting sign-in.");
  } finally { db.close(); }
}

// Run once with the old portal stopped. SQLite locks the target through the import.
// A repeated invocation leaves subsequent sessions, revocations and invites intact.
export function consolidateAccess(path, source) {
  const db = gameDatabase(path, false);
  try {
    db.exec("BEGIN IMMEDIATE");
    db.exec("CREATE TABLE IF NOT EXISTS staging_access_migration(version INTEGER PRIMARY KEY CHECK(version=1))");
    if (db.prepare("SELECT 1 FROM staging_access_migration WHERE version=1").get()) {
      db.exec("COMMIT");
      return "already consolidated";
    }
    initializeAccessTables(db);
    if (tables.some(t => db.prepare(`SELECT 1 FROM main.${t} LIMIT 1`).get()))
      throw Error("The game database already contains unmarked access records. Review before importing.");
    if (source !== "--fresh") {
      const existing = realpathSync(source);
      if (existing === realpathSync(path)) throw Error("Choose the prior access database as the source.");
      db.prepare("ATTACH DATABASE ? AS prior").run(pathToFileURL(existing).href + "?mode=ro");
      const priorTables = new Set(db.prepare("SELECT name FROM prior.sqlite_schema WHERE type='table'").all().map(row => row.name));
      if (!["testers", "invitations", "sessions", "game_profiles"].every(t => priorTables.has(t)))
        throw Error("Expected the existing unified game-access database.");
      if (db.prepare("SELECT 1 FROM prior.testers WHERE salt<>'' OR password<>'' LIMIT 1").get())
        throw Error("Separate portal passwords cannot be imported as game credentials.");
      const priorSessionProtocol = db.prepare("PRAGMA prior.table_info(sessions)").all().some(row => row.name === "login_protocol");
      for (const table of tables.filter(t => priorTables.has(t))) {
        const columns = db.prepare(`PRAGMA main.table_info(${table})`).all()
          .map(row => row.name)
          .filter(name => table !== "sessions" || name !== "login_protocol" || priorSessionProtocol)
          .join(",");
        db.exec(`INSERT INTO main.${table} (${columns}) SELECT ${columns} FROM prior.${table}`);
      }
      const unmatched = db.prepare(`SELECT 1 FROM main.testers t LEFT JOIN main.game_profiles g USING(email)
        LEFT JOIN main.player_profiles p ON p.id=g.profile_id
        WHERE p.id IS NULL OR json_extract(p.document,'$.account.login') IS NOT g.login LIMIT 1`).get();
      if (unmatched) throw Error("A tester does not match an existing game profile. The import was rolled back.");
    }
    if (db.prepare("PRAGMA main.foreign_key_check").get()) throw Error("Invalid account reference in import.");
    db.exec("INSERT INTO staging_access_migration VALUES(1); COMMIT");
    return source === "--fresh" ? "initialized empty alpha access" : "imported alpha access";
  } finally { db.close(); } // An uncommitted transaction rolls back on close.
}
