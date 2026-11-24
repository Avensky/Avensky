//! Account credential data stays private to the control plane.
use super::{
    model::{id, timestamp},
    security,
};
use argon2::{
    Argon2, PasswordHasher,
    password_hash::{SaltString, rand_core::OsRng},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, VecDeque},
    sync::Arc,
};
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};

const SESSION_SECONDS: u64 = 30 * 24 * 60 * 60;
const SESSION_LIMIT: usize = 8;
const DUMMY_HASH: &str = "$argon2id$v=19$m=19456,t=2,p=1$YXZlbnNreS1kdW1teS1zYWx0$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
pub const LOGIN_FAILED: &str = "The email, account name, or password is incorrect.";

#[derive(Clone, Serialize, Deserialize)]
pub struct Account {
    pub login: String,
    pub password_hash: String,
    sessions: BTreeMap<String, u64>,
}

impl Account {
    pub fn new(login: String, password_hash: String) -> Self {
        Self {
            login,
            password_hash,
            sessions: BTreeMap::new(),
        }
    }

    pub fn accepts(&self, hash: &str) -> bool {
        self.sessions
            .get(hash)
            .is_some_and(|&expires| expires > timestamp())
    }

    pub fn issue(&mut self) -> String {
        let now = timestamp();
        self.sessions.retain(|_, expires| *expires > now);
        if self.sessions.len() >= SESSION_LIMIT
            && let Some(hash) = self
                .sessions
                .iter()
                .min_by_key(|(_, expires)| *expires)
                .map(|(hash, _)| hash.clone())
        {
            self.sessions.remove(&hash);
        }
        let token = format!("{}{}", id(), id());
        self.sessions
            .insert(security::token_hash(&token), now + SESSION_SECONDS);
        token
    }

    pub fn revoke(&mut self, token: &str) -> bool {
        token.len() == 64 && self.sessions.remove(&security::token_hash(token)).is_some()
    }
}

pub fn normalize_login(value: &str) -> Result<String, String> {
    let value = value.trim();
    if let Some((local, domain)) = value.split_once('@') {
        let valid_local = !local.is_empty()
            && local.len() <= 64
            && !local.starts_with('.')
            && !local.ends_with('.')
            && !local.contains("..")
            && local
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"._+-".contains(&c));
        let valid_domain = domain.contains('.')
            && domain.split('.').all(|label| {
                !label.is_empty()
                    && label.len() <= 63
                    && !label.starts_with('-')
                    && !label.ends_with('-')
                    && label
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || c == b'-')
            });
        if value.len() <= 254 && valid_local && valid_domain {
            return Ok(value.to_ascii_lowercase());
        }
        return Err("Enter a valid email address.".into());
    }
    if !(3..=24).contains(&value.len())
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
    {
        return Err(
            "Use 3–24 letters, numbers, hyphens or underscores for your account name.".into(),
        );
    }
    Ok(value.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::normalize_login;

    #[test]
    fn normalizes_email_and_existing_account_names() {
        assert_eq!(
            normalize_login(" Test+Alpha@Example.COM ").unwrap(),
            "test+alpha@example.com"
        );
        assert_eq!(normalize_login(" Legacy_Player ").unwrap(), "legacy_player");
        assert!(normalize_login("test@-example.com").is_err());
        assert!(normalize_login("test@example.com@other.com").is_err());
    }
}

pub fn validate_password(password: &str) -> Result<(), String> {
    if !(15..=128).contains(&password.chars().count()) || password.len() > 512 {
        return Err("Choose a password with 15–128 characters.".into());
    }
    Ok(())
}

pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|value| value.to_string())
        .map_err(|_| "Could not protect the account password.".into())
}

pub fn verify_password(password: &str, hash: Option<&str>) -> bool {
    use argon2::{PasswordVerifier, password_hash::PasswordHash};
    if password.len() > 512 {
        return false;
    }
    let matched = PasswordHash::new(hash.unwrap_or(DUMMY_HASH)).is_ok_and(|parsed| {
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    });
    hash.is_some() && matched
}

pub struct AccountAccess {
    // A reconnect cannot reset this limit. Limit hash workers independently
    // and leave the social mutation lock available while Argon2 runs.
    attempts: Mutex<VecDeque<(u64, String)>>,
    workers: Arc<Semaphore>,
}

impl Default for AccountAccess {
    fn default() -> Self {
        Self {
            attempts: Mutex::new(VecDeque::new()),
            workers: Arc::new(Semaphore::new(2)),
        }
    }
}

impl AccountAccess {
    pub async fn admit(&self, login: &str) -> Result<OwnedSemaphorePermit, String> {
        let throttle = || "Too many account attempts. Wait a minute and try again.".to_owned();
        let permit = self
            .workers
            .clone()
            .try_acquire_owned()
            .map_err(|_| throttle())?;
        let now = timestamp();
        let mut attempts = self.attempts.lock().await;
        attempts.retain(|(at, _)| now.saturating_sub(*at) < 60);
        if attempts.len() >= 30 || attempts.iter().filter(|(_, name)| name == login).count() >= 5 {
            return Err(throttle());
        }
        attempts.push_back((now, login.to_owned()));
        Ok(permit)
    }
}
