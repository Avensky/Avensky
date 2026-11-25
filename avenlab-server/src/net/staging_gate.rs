use crate::{server::Server, social::model::timestamp};
use futures::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use serde_json::{Value, json};
use sha2::Sha256;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use subtle::ConstantTimeEq;
use tokio::net::TcpStream;
use tokio_tungstenite::{
    WebSocketStream,
    tungstenite::{Message, handshake::server::Request},
};

const STAGING_ORIGIN: &str = "https://staging.avensky.com";
pub const PROOF_MAX_AGE_MS: u64 = 5_000;

pub fn staging_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub struct StagingGate(String);

pub enum Admission {
    Legacy,
    Denied,
    Bridge,
    Player {
        profile_id: String,
        expires: u64,
        issued: u64,
        session: Option<String>,
    },
}

impl StagingGate {
    pub fn load() -> anyhow::Result<Option<Self>> {
        if std::env::var("AVENLAB_ENV").as_deref() != Ok("staging") {
            return Ok(None);
        }
        let Ok(key) = std::env::var("AVENLAB_STAGING_SIGN_IN_KEY") else {
            return Ok(None);
        };
        anyhow::ensure!(
            key.len() == 64 && key.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "AVENLAB_STAGING_SIGN_IN_KEY must contain 64 hexadecimal characters"
        );
        Ok(Some(Self(key)))
    }

    pub fn admit(&self, request: &Request) -> Admission {
        let header = |name| {
            request
                .headers()
                .get(name)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
        };
        if request.uri().path() == "/__alpha_bridge" {
            return if bool::from(
                self.0
                    .as_bytes()
                    .ct_eq(header("x-avensky-alpha-bridge").as_bytes()),
            ) {
                Admission::Bridge
            } else {
                Admission::Denied
            };
        }
        let profile_id = header("x-avensky-alpha-profile");
        let expires = header("x-avensky-alpha-expires")
            .parse::<u64>()
            .unwrap_or_default();
        let seconds = expires.saturating_sub(timestamp());
        let issued = header("x-avensky-alpha-issued")
            .parse::<u64>()
            .unwrap_or_default();
        // The digest is an identifier signed by the trusted verifier, never a bearer cookie.
        // Unversioned MACs remain valid during the staged verifier rollout.
        let value = header("x-avensky-alpha-proof");
        let (session, proof) = match value.split_once('.') {
            Some((digest, mac))
                if digest.len() == 64 && digest.bytes().all(|b| b.is_ascii_hexdigit()) =>
            {
                (Some(digest), mac)
            }
            Some(_) => return Admission::Denied,
            None => (None, value),
        };
        let now_ms = staging_now_ms();
        if request.uri().path() != "/ws/"
            || header("origin") != STAGING_ORIGIN
            || profile_id.len() != 32
            || !profile_id.bytes().all(|byte| byte.is_ascii_hexdigit())
            || !(1..=12 * 60 * 60).contains(&seconds)
            || issued > now_ms
            || now_ms - issued > PROOF_MAX_AGE_MS
            || proof.len() != 64
            || !proof.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Admission::Denied;
        }
        let mut bytes = [0; 32];
        for (index, byte) in bytes.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&proof[2 * index..2 * index + 2], 16).unwrap_or_default();
        }
        let mut hmac =
            Hmac::<Sha256>::new_from_slice(self.0.as_bytes()).expect("HMAC accepts any key size");
        hmac.update(format!("avensky-staging-ws:{profile_id}:{issued}:{expires}").as_bytes());
        if let Some(digest) = session {
            hmac.update(b":");
            hmac.update(digest.as_bytes());
        }
        if hmac.verify_slice(&bytes).is_err() {
            return Admission::Denied;
        }
        Admission::Player {
            profile_id: profile_id.to_owned(),
            expires,
            issued,
            session: session.map(str::to_owned),
        }
    }
}

pub async fn service_bridge(server: &Server, mut socket: WebSocketStream<TcpStream>) {
    let _ = tokio::time::timeout(Duration::from_secs(8), async {
        let Some(Ok(Message::Text(text))) = socket.next().await else {
            return;
        };
        if text.len() > 4096 {
            return;
        }
        let Ok(request) = serde_json::from_str::<Value>(&text) else {
            return;
        };
        let response = match server.staging_account(&request).await {
            Ok(data) => json!({ "ok": true, "data": data }),
            Err(message) => json!({ "ok": false, "message": message }),
        };
        let _ = socket.send(Message::Text(response.to_string())).await;
        let _ = socket.close(None).await;
    })
    .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn staging_gate_rejects_anonymous_forged_and_stale_credentials() {
        let key = "a".repeat(64);
        let gate = StagingGate(key.clone());
        let profile = "c".repeat(32);
        let expires = timestamp() + 60;
        let request = |profile: &str, issued: u64, proof: &str| {
            Request::builder()
                .uri("/ws/")
                .header("Origin", STAGING_ORIGIN)
                .header("X-Avensky-Alpha-Profile", profile)
                .header("X-Avensky-Alpha-Expires", expires)
                .header("X-Avensky-Alpha-Issued", issued)
                .header("X-Avensky-Alpha-Proof", proof)
                .body(())
                .unwrap()
        };
        let signed = |issued: u64| {
            let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).unwrap();
            mac.update(format!("avensky-staging-ws:{profile}:{issued}:{expires}").as_bytes());
            format!("{:x}", mac.finalize().into_bytes())
        };
        let now = staging_now_ms();
        assert!(matches!(
            gate.admit(&Request::builder().uri("/ws/").body(()).unwrap()),
            Admission::Denied
        ));
        assert!(matches!(
            gate.admit(&request(&profile, now, &signed(now))),
            Admission::Player { .. }
        ));
        assert!(matches!(
            gate.admit(&request(&"b".repeat(32), now, &signed(now))),
            Admission::Denied
        ));
        let digest = "d".repeat(64);
        let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).unwrap();
        mac.update(format!("avensky-staging-ws:{profile}:{now}:{expires}:{digest}").as_bytes());
        let tag = format!("{:x}", mac.finalize().into_bytes());
        assert!(
            matches!(gate.admit(&request(&profile, now, &format!("{digest}.{tag}"))),
            Admission::Player { session: Some(value), .. } if value == digest)
        );
        for proof in [
            format!("{}.{tag}", "e".repeat(64)),
            format!("{digest}.{}", signed(now)),
            tag,
        ] {
            assert!(matches!(
                gate.admit(&request(&profile, now, &proof)),
                Admission::Denied
            ));
        }
        let stale = now - PROOF_MAX_AGE_MS - 1;
        assert!(matches!(
            gate.admit(&request(&profile, stale, &signed(stale))),
            Admission::Denied
        ));
        assert!(matches!(
            gate.admit(&Request::builder().uri("/__alpha_bridge").body(()).unwrap()),
            Admission::Denied
        ));
    }
}
