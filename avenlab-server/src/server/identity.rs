use super::*;
use crate::social::accounts::{self, Account};

impl Server {
    pub fn player_accounts_enabled(&self) -> bool {
        self.accounts.is_some()
    }

    pub(super) async fn handle_identity(
        &self,
        player: &str,
        action: &str,
        value: &Value,
    ) -> Result<Value, String> {
        let text = |key: &str| value.get(key).and_then(Value::as_str).unwrap_or_default();
        let credential = if matches!(action, "account_register" | "account_login") {
            let access = self
                .accounts
                .as_ref()
                .ok_or("Player accounts are unavailable on this server.")?;
            let registering = action == "account_register";
            let login = accounts::normalize_login(text("login")).map_err(|error| {
                if registering {
                    error
                } else {
                    accounts::LOGIN_FAILED.to_owned()
                }
            })?;
            let password = text("password").to_owned();
            if registering {
                valid_name(text("name"), 24)?;
                accounts::validate_password(&password)?;
            }
            let permit = access.admit(&login).await?;
            let hash = if registering {
                tokio::task::spawn_blocking(move || {
                    let _permit = permit;
                    accounts::hash_password(&password)
                })
                .await
                .map_err(|_| "The password worker stopped.")??
            } else {
                let hash = self
                    .data
                    .lock()
                    .await
                    .profiles
                    .values()
                    .filter_map(|profile| profile.account.as_ref())
                    .find(|account| account.login == login)
                    .map(|account| account.password_hash.clone());
                tokio::task::spawn_blocking(move || {
                    let _permit = permit;
                    if accounts::verify_password(&password, hash.as_deref()) {
                        hash.ok_or(accounts::LOGIN_FAILED)
                    } else {
                        Err(accounts::LOGIN_FAILED)
                    }
                })
                .await
                .map_err(|_| "The password worker stopped.")??
            };
            Some((login, hash))
        } else {
            None
        };

        let _operation = self.operations.lock().await;
        let connection = self
            .connections
            .lock()
            .await
            .get(player)
            .cloned()
            .ok_or("The connection closed.")?;
        let current = connection.profile_id.as_deref();
        let previous = self.data.lock().await.clone();
        let mut next = previous.clone();
        let (profile_id, token) = match action {
            "account_register" => {
                let (login, hash) = credential.expect("Registration passed the password check");
                if next.profiles.values().any(|profile| {
                    profile
                        .account
                        .as_ref()
                        .is_some_and(|account| account.login == login)
                }) {
                    return Err("That account name is unavailable.".into());
                }
                let profile_id = match current {
                    Some(existing) if next.profile(existing)?.account.is_none() => {
                        existing.to_owned()
                    }
                    Some(_) => return Err("Sign out before registering another account.".into()),
                    None => next.authenticate(None, text("name"))?.0,
                };
                let profile = next
                    .profiles
                    .get_mut(&profile_id)
                    .ok_or("The player profile is unavailable.")?;
                profile.name = valid_name(text("name"), 24)?;
                profile.token_hash.clear();
                let mut account = Account::new(login, hash);
                let token = account.issue();
                profile.account = Some(account);
                (Some(profile_id), Some(token))
            }
            "account_login" => {
                let (login, hash) = credential.expect("Login passed the password check");
                let profile = next
                    .profiles
                    .values_mut()
                    .find(|profile| {
                        profile.account.as_ref().is_some_and(|account| {
                            account.login == login && account.password_hash == hash
                        })
                    })
                    .ok_or(accounts::LOGIN_FAILED)?;
                let account = profile.account.as_mut().ok_or(accounts::LOGIN_FAILED)?;
                (Some(profile.id.clone()), Some(account.issue()))
            }
            "account_logout" => {
                let profile = next
                    .profiles
                    .get_mut(current.ok_or("Choose a player profile first.")?)
                    .ok_or("The player profile is unavailable.")?;
                if let Some(account) = profile.account.as_mut()
                    && !account.revoke(text("token"))
                {
                    return Err("This session could not be signed out.".into());
                }
                (None, None)
            }
            _ => {
                let (id, token) =
                    next.authenticate(value.get("token").and_then(Value::as_str), text("name"))?;
                (Some(id), token)
            }
        };
        if current.is_some()
            && (current != profile_id.as_deref() || action == "account_register")
            && (connection.world_id.is_some()
                || self
                    .alpha
                    .lock()
                    .await
                    .queue
                    .iter()
                    .any(|ticket| ticket.player == player))
        {
            return Err("Leave your current session before switching profiles.".into());
        }
        if profile_id.is_some()
            && self
                .connections
                .lock()
                .await
                .iter()
                .any(|(id, client)| id != player && client.profile_id == profile_id)
        {
            return Err(
                "This player profile is already connected on another device or tab.".into(),
            );
        }
        let profile = profile_id.as_deref().and_then(|id| next.profiles.get(id));
        let account = profile.is_some_and(|profile| profile.account.is_some());
        let name = profile.map(|profile| profile.name.clone());
        if token.is_some() || action == "account_logout" {
            *self.data.lock().await = next;
            self.commit(previous).await?;
        }
        self.connections
            .lock()
            .await
            .get_mut(player)
            .ok_or("The connection closed.")?
            .profile_id
            .clone_from(&profile_id);
        if let Some(id) = &profile_id {
            self.restore_reservation(player, id).await;
        }
        self.publish().await;
        Ok(json!({"profile_id":profile_id,"token":token,"name":name,"account":account}))
    }
}
