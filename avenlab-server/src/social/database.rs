//! One writer on a local volume. Profile and social changes commit together.
use super::model::SocialData;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;
use std::{fs::OpenOptions, path::Path, time::Duration};

fn open(path: &Path) -> anyhow::Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = OpenOptions::new();
    file.write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        file.mode(0o600);
    }
    file.open(path)?;
    let connection = Connection::open(path)?;
    connection.busy_timeout(Duration::from_secs(3))?;
    connection.execute_batch(
        "PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS social_state (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            document TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS player_profiles (
            id TEXT PRIMARY KEY NOT NULL,
            document TEXT NOT NULL
        );",
    )?;
    Ok(connection)
}

pub fn load_or_import(path: &Path, legacy: &Path) -> anyhow::Result<SocialData> {
    let connection = open(path)?;
    let document: Option<String> = connection
        .query_row(
            "SELECT document FROM social_state WHERE singleton = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    let Some(document) = document else {
        let data = SocialData::load(legacy)?;
        save(path, &data)?;
        return Ok(data);
    };
    let mut data: Value = serde_json::from_str(&document)?;
    let mut statement = connection.prepare("SELECT id, document FROM player_profiles")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let profiles = data
        .get_mut("profiles")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| anyhow::anyhow!("Missing profiles in the social database"))?;
    for row in rows {
        let (id, document) = row?;
        profiles.insert(id, serde_json::from_str(&document)?);
    }
    SocialData::decode(&serde_json::to_vec(&data)?)
}

pub fn save(path: &Path, data: &SocialData) -> anyhow::Result<()> {
    let mut document = serde_json::to_value(data)?;
    anyhow::ensure!(
        serde_json::to_vec(&document)?.len() <= 8 * 1024 * 1024,
        "The social data budget is full"
    );
    let profiles = std::mem::take(
        document["profiles"]
            .as_object_mut()
            .ok_or_else(|| anyhow::anyhow!("Missing profiles in the social state"))?,
    );
    let mut connection = open(path)?;
    let tx = connection.transaction()?;
    tx.execute(
        "INSERT INTO social_state VALUES (1, ?1)
        ON CONFLICT(singleton) DO UPDATE SET document = excluded.document
        WHERE social_state.document <> excluded.document",
        [serde_json::to_string(&document)?],
    )?;
    {
        let mut upsert = tx.prepare(
            "INSERT INTO player_profiles VALUES (?1, ?2)
            ON CONFLICT(id) DO UPDATE SET document = excluded.document
            WHERE player_profiles.document <> excluded.document",
        )?;
        for (id, profile) in &profiles {
            upsert.execute(params![id, serde_json::to_string(profile)?])?;
        }
    }
    let ids = serde_json::to_string(&profiles.keys().collect::<Vec<_>>())?;
    tx.execute(
        "DELETE FROM player_profiles WHERE id NOT IN (SELECT value FROM json_each(?1))",
        [ids],
    )?;
    tx.commit()?;
    Ok(())
}
