use super::*;
use crate::outbox::CloseReason;
use std::collections::HashSet;

fn valid_profile(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_digest(digest: &str) -> bool {
    digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn session_status(
    live: &HashMap<String, HashSet<String>>,
    profile: &str,
    digest: &str,
) -> Result<(), CloseReason> {
    match live.get(profile) {
        Some(sessions) if sessions.contains(digest) => Ok(()),
        Some(_) => Err(CloseReason::Replaced),
        None => Err(CloseReason::SessionEnded),
    }
}

use crate::net::{PROOF_MAX_AGE_MS, staging_now_ms};

impl Server {
    pub async fn staging_account(&self, request: &Value) -> Result<Value, String> {
        let text = |key: &str| request.get(key).and_then(Value::as_str).unwrap_or_default();
        let registering = match text("action") {
            "check" => false,
            "register" => true,
            "metadata" => {
                return Ok(
                    json!({ "server_id": self.data.lock().await.server_id, "session_takeover_version": 2 }),
                );
            }
            "recovery_profile" => {
                let login = crate::social::accounts::normalize_login(text("login"))?;
                let data = self.data.lock().await;
                let profile = data
                    .profiles
                    .values()
                    .find(|profile| {
                        profile
                            .account
                            .as_ref()
                            .is_some_and(|account| account.login == login)
                    })
                    .ok_or("No game account was found for this login.")?;
                return Ok(json!({ "profile_id": profile.id }));
            }
            "reset_password" => {
                return self
                    .reset_staging_password(text("profile_id"), text("login"), text("password"))
                    .await;
            }
            action @ ("session_changed" | "disconnect") => {
                let _op = self.operations.lock().await;
                let profile = text("profile_id");
                if !valid_profile(profile) {
                    return Err("The game profile is unavailable.".into());
                }
                if action == "disconnect" && request.get("session_digest").is_none() {
                    self.disconnect_staging_profile(profile).await;
                } else {
                    let digest = text("session_digest");
                    if !valid_digest(digest) {
                        return Err("Invalid staging session.".into());
                    }
                    if action == "session_changed" {
                        let live = self.portal_sessions(vec![profile.to_owned()]).await?;
                        // A delayed callback from a previous login must never evict the winner.
                        if session_status(&live, profile, digest).is_ok() {
                            self.retire_profile_sockets(
                                profile,
                                |session| session != Some(digest),
                                CloseReason::Replaced,
                            )
                            .await;
                        }
                    } else {
                        // The portal has already deleted this grant. A stale logout
                        // names only its own connection, even if a new login has won.
                        self.retire_profile_sockets(
                            profile,
                            |session| session == Some(digest),
                            CloseReason::SessionEnded,
                        )
                        .await;
                    }
                }
                return Ok(json!({}));
            }
            _ => return Err("Unknown staging account request.".into()),
        };
        if registering {
            valid_name(text("name"), 24)?;
        }
        let (login, hash) = self
            .account_credentials(text("login"), text("password"), registering)
            .await?;
        let _op = self.operations.lock().await;
        let profile_id = if registering {
            let previous = self.data.lock().await.clone();
            let mut next = previous.clone();
            let device = text("device_token");
            let owner = if device.is_empty() {
                None
            } else {
                Some(next.authenticate(Some(device), text("name"))?.0)
            };
            let name = if let Some(owner) = &owner {
                next.profile(owner)?.name.clone()
            } else {
                text("name").to_owned()
            };
            let id = Self::create_game_account(&mut next, owner.as_deref(), &name, login, hash)?;
            *self.data.lock().await = next;
            self.commit(previous).await?;
            id
        } else {
            self.data
                .lock()
                .await
                .profiles
                .values()
                .find(|profile| {
                    profile.account.as_ref().is_some_and(|account| {
                        account.login == login && account.password_hash == hash
                    })
                })
                .map(|profile| profile.id.clone())
                .ok_or(crate::social::accounts::LOGIN_FAILED)?
        };
        Ok(json!({ "profile_id": profile_id }))
    }

    async fn reset_staging_password(
        &self,
        profile_id: &str,
        login: &str,
        password: &str,
    ) -> Result<Value, String> {
        let (login, hash) = self.account_credentials(login, password, true).await?;
        let _op = self.operations.lock().await;
        let previous = self.data.lock().await.clone();
        let mut next = previous.clone();
        let account = next
            .profiles
            .get_mut(profile_id)
            .and_then(|profile| profile.account.as_mut())
            .filter(|account| account.login == login)
            .ok_or("The game account is unavailable.")?;
        *account = crate::social::accounts::Account::new(login, hash);
        *self.data.lock().await = next;
        self.commit(previous).await?;
        self.disconnect_staging_profile(profile_id).await;
        Ok(json!({}))
    }

    async fn portal_sessions(
        &self,
        profiles: Vec<String>,
    ) -> Result<HashMap<String, HashSet<String>>, String> {
        let path = self.path.with_extension("sqlite3");
        tokio::task::spawn_blocking(move || -> rusqlite::Result<_> {
            let db = rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            db.busy_timeout(std::time::Duration::from_secs(2))?;
            let mut stmt = db.prepare("SELECT s.digest FROM game_profiles g JOIN testers t USING(email)
                JOIN sessions s USING(email) WHERE g.profile_id=?1 AND t.revoked=0 AND s.expires>?2")?;
            let mut live: HashMap<String, HashSet<String>> = HashMap::new();
            for profile in profiles {
                let rows = stmt.query_map(rusqlite::params![profile, timestamp()], |r| r.get::<_, String>(0))?;
                for digest in rows { live.entry(profile.clone()).or_default().insert(digest?); }
            }
            Ok(live)
        }).await.map_err(|_| "Staging session check stopped.")?
          .map_err(|_| "Staging session storage is unavailable.".into())
    }

    // During rollout the old verifier signs the cookie expiry but not its digest. Resolve
    // only a unique live grant created by that legacy portal. The old schema has no
    // protocol column; its sessions were all created by the v1 password/MFA flow.
    async fn legacy_portal_session(
        &self,
        profile: &str,
        expires: u64,
    ) -> Result<String, CloseReason> {
        let path = self.path.with_extension("sqlite3");
        let profile = profile.to_owned();
        let digest = tokio::task::spawn_blocking(move || -> rusqlite::Result<Option<String>> {
            let db = rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            let versioned: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM pragma_table_info('sessions') WHERE name='login_protocol')", [], |r| r.get(0))?;
            let protocol = if versioned { " AND s.login_protocol=1" } else { "" };
            let query = format!("SELECT CASE WHEN COUNT(*)=1 THEN MIN(s.digest) END
                FROM game_profiles g JOIN testers t USING(email) JOIN sessions s USING(email)
                WHERE g.profile_id=?1 AND t.revoked=0 AND s.expires=?2 AND s.expires>?3{protocol}");
            db.query_row(&query, rusqlite::params![profile, expires, timestamp()], |r| r.get(0))
        }).await.map_err(|_| CloseReason::Transport)?.map_err(|_| CloseReason::Transport)?;
        digest.ok_or(CloseReason::SessionEnded)
    }

    // Called with operations held, just like disconnect_locked and restore_reservation.
    async fn retire_profile_sockets(
        &self,
        profile: &str,
        should_retire: impl Fn(Option<&str>) -> bool,
        reason: CloseReason,
    ) {
        let owners: Vec<_> = self
            .connections
            .lock()
            .await
            .iter()
            .filter(|(_, client)| {
                client.profile_id.as_deref() == Some(profile)
                    && should_retire(client.staging_session.as_deref())
            })
            .map(|(id, client)| (id.clone(), client.tx.clone()))
            .collect();
        for (id, tx) in owners {
            tx.close(reason);
            self.disconnect_locked(&id).await;
        }
    }

    // Legacy admissions have no session digest. Retire in-flight proofs across revocation.
    async fn remember_revocation(&self, profile: &str) {
        let now = staging_now_ms();
        let mut recent = self.staging_disconnects.lock().await;
        recent.retain(|_, cutoff| now.saturating_sub(*cutoff) <= PROOF_MAX_AGE_MS);
        recent.insert(profile.to_owned(), now);
    }

    async fn disconnect_staging_profile(&self, profile: &str) {
        self.remember_revocation(profile).await;
        self.retire_profile_sockets(profile, |_| true, CloseReason::SessionEnded)
            .await;
    }

    // Bounded repair if the trusted portal commits a change but loses its bridge notification.
    pub async fn recheck_staging_sessions(&self) {
        let bindings: Vec<_> = self
            .connections
            .lock()
            .await
            .iter()
            .filter_map(|(id, client)| {
                Some((
                    id.clone(),
                    client.profile_id.clone()?,
                    client.staging_session.clone()?,
                ))
            })
            .collect();
        if bindings.is_empty() {
            return;
        }
        let profiles: HashSet<_> = bindings
            .iter()
            .map(|(_, profile, _)| profile.clone())
            .collect();
        let Ok(live) = self.portal_sessions(profiles.into_iter().collect()).await else {
            return;
        };
        let _op = self.operations.lock().await;
        // A fresh owner may have attached while SQLite was being read. Only apply the
        // snapshot to the specific bindings that were observed before the query.
        for (id, profile, digest) in bindings {
            if let Err(reason) = session_status(&live, &profile, &digest) {
                let tx = self
                    .connections
                    .lock()
                    .await
                    .get(&id)
                    .filter(|c| c.staging_session.as_deref() == Some(digest.as_str()))
                    .map(|c| c.tx.clone());
                if let Some(tx) = tx {
                    tx.close(reason);
                    self.disconnect_locked(&id).await;
                }
            }
        }
    }

    pub async fn attach_staging_profile(
        &self,
        player: &str,
        profile: &str,
        issued: u64,
        expires: u64,
        session: Option<&str>,
    ) -> Result<(), CloseReason> {
        let _op = self.operations.lock().await;
        let now = staging_now_ms();
        if issued > now
            || now - issued > PROOF_MAX_AGE_MS
            || self
                .staging_disconnects
                .lock()
                .await
                .get(profile)
                .is_some_and(|cutoff| issued <= *cutoff)
        {
            return Err(CloseReason::SessionEnded);
        }
        if self
            .data
            .lock()
            .await
            .profile(profile)
            .ok()
            .and_then(|p| p.account.as_ref())
            .is_none()
        {
            return Err(CloseReason::SessionEnded);
        }
        let existing = {
            let clients = self.connections.lock().await;
            if !clients.contains_key(player) {
                return Err(CloseReason::Transport);
            }
            clients
                .iter()
                .find(|(id, c)| id.as_str() != player && c.profile_id.as_deref() == Some(profile))
                .map(|(id, c)| (id.clone(), c.staging_session.clone(), c.tx.clone()))
        };
        let owned_digest = if let Some(digest) = session {
            let live = self
                .portal_sessions(vec![profile.to_owned()])
                .await
                .map_err(|_| CloseReason::Transport)?;
            session_status(&live, profile, digest)?;
            if let Some((old, previous, tx)) = existing {
                // Shared cookies and still-valid pre-upgrade sessions cannot fight over one socket.
                let Some(previous) = previous else {
                    return Err(CloseReason::DuplicateTab);
                };
                if session_status(&live, profile, &previous).is_ok() {
                    return Err(CloseReason::DuplicateTab);
                }
                tx.close(CloseReason::Replaced);
                self.disconnect_locked(&old).await;
            }
            digest.to_owned()
        } else {
            let digest = self.legacy_portal_session(profile, expires).await?;
            if existing.is_some() {
                return Err(CloseReason::DuplicateTab);
            }
            digest
        };
        {
            let mut clients = self.connections.lock().await;
            let client = clients.get_mut(player).ok_or(CloseReason::Transport)?;
            client.profile_id = Some(profile.to_owned());
            client.staging_session = Some(owned_digest);
        }
        self.restore_reservation(player, profile).await;
        Ok(())
    }
}
