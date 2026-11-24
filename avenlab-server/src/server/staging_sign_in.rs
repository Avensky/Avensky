use super::*;
use crate::net::{PROOF_MAX_AGE_MS, staging_now_ms};

impl Server {
    pub async fn staging_account(&self, request: &Value) -> Result<Value, String> {
        let text = |key: &str| request.get(key).and_then(Value::as_str).unwrap_or_default();
        let registering = match text("action") {
            "check" => false,
            "register" => true,
            "metadata" => return Ok(json!({ "server_id": self.data.lock().await.server_id })),
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
            "disconnect" => {
                let _op = self.operations.lock().await;
                let profile = text("profile_id");
                if profile.len() != 32 || !profile.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                    return Err("The game profile is unavailable.".into());
                }
                self.disconnect_staging_profile(profile).await;
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

    // Call with operations held so a socket cannot attach during revocation.
    async fn disconnect_staging_profile(&self, profile: &str) {
        let now = staging_now_ms();
        {
            let mut recent = self.staging_disconnects.lock().await;
            recent.retain(|_, cutoff| now.saturating_sub(*cutoff) <= PROOF_MAX_AGE_MS);
            recent.insert(profile.to_owned(), now);
        }
        for client in self.connections.lock().await.values() {
            if client.profile_id.as_deref() == Some(profile) {
                client.tx.close();
            }
        }
    }

    pub async fn attach_staging_profile(
        &self,
        player: &str,
        profile: &str,
        issued: u64,
    ) -> Result<(), String> {
        let _op = self.operations.lock().await;
        if staging_now_ms().saturating_sub(issued) > PROOF_MAX_AGE_MS
            || self
                .staging_disconnects
                .lock()
                .await
                .get(profile)
                .is_some_and(|cutoff| issued <= *cutoff)
        {
            return Err("The staging session ended. Sign in again.".into());
        }
        if self.data.lock().await.profile(profile)?.account.is_none() {
            return Err("The game account is unavailable.".into());
        }
        {
            let mut clients = self.connections.lock().await;
            if clients
                .iter()
                .any(|(id, client)| id != player && client.profile_id.as_deref() == Some(profile))
            {
                return Err(
                    "This player profile is already connected on another device or tab.".into(),
                );
            }
            clients
                .get_mut(player)
                .ok_or("The game connection closed.")?
                .profile_id = Some(profile.to_owned());
        }
        self.restore_reservation(player, profile).await;
        Ok(())
    }
}
