//! Infrequent reliable events must never wait for a socket under a game lock.
//! An overflow closes the connection: dropping a config/result and continuing
//! would leave the client inconsistent. Reconnection uses the normal lease.
use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};
use tokio::sync::{mpsc, watch};

const MAX_MESSAGES: usize = 128;
const MAX_BYTES: usize = 16 * 1024 * 1024;

struct Message {
    text: String,
    bytes: usize,
    budget: Arc<AtomicUsize>,
}
impl Drop for Message {
    fn drop(&mut self) { self.budget.fetch_sub(self.bytes, Ordering::Relaxed); }
}
impl Message {
    fn into_text(mut self) -> String { std::mem::take(&mut self.text) }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CloseReason {
    Transport,
    Replaced,
    DuplicateTab,
    SessionEnded,
}

impl CloseReason {
    pub fn notice(self) -> Option<(u16, &'static str)> {
        match self {
            Self::Transport => None,
            Self::Replaced => Some((4001, "Your account was signed in on another device.")),
            Self::DuplicateTab => Some((4002, "This session is already open in another tab.")),
            Self::SessionEnded => Some((4003, "Your staging session ended. Sign in again.")),
        }
    }
}

#[derive(Clone)]
pub struct Sender {
    tx: mpsc::Sender<Message>,
    budget: Arc<AtomicUsize>,
    max_bytes: usize,
    failed: watch::Sender<Option<CloseReason>>,
}
pub struct Receiver { rx: mpsc::Receiver<Message> }

pub fn channel() -> (Sender, Receiver) { with_limits(MAX_MESSAGES, MAX_BYTES) }
fn with_limits(messages: usize, max_bytes: usize) -> (Sender, Receiver) {
    let (tx, rx) = mpsc::channel(messages);
    let (failed, _) = watch::channel(None);
    (Sender { tx, budget: Arc::new(AtomicUsize::new(0)), max_bytes, failed }, Receiver { rx })
}

impl Sender {
    pub fn failure(&self) -> watch::Receiver<Option<CloseReason>> { self.failed.subscribe() }
    pub fn close(&self, reason: CloseReason) {
        self.failed.send_if_modified(|current| {
            // A racing overflow must not erase a specific authentication close frame.
            if current.is_none() || *current == Some(CloseReason::Transport) && reason.notice().is_some() {
                *current = Some(reason);
                true
            } else { false }
        });
    }
    pub fn send(&self, text: String) -> Result<(), ()> {
        if self.failed.borrow().is_some() { return Err(()); }
        let bytes = text.len();
        if self.budget.fetch_update(Ordering::Relaxed, Ordering::Relaxed,
            |used| used.checked_add(bytes).filter(|next| *next <= self.max_bytes)).is_err() {
            self.close(CloseReason::Transport);
            return Err(());
        }
        // An unsuccessful try_send drops the envelope and releases its bytes.
        if self.tx.try_send(Message { text, bytes, budget: self.budget.clone() }).is_err() {
            self.close(CloseReason::Transport);
            return Err(());
        }
        Ok(())
    }
}
impl Receiver {
    pub async fn recv(&mut self) -> Option<String> { self.rx.recv().await.map(Message::into_text) }
    #[cfg(test)]
    pub fn try_recv(&mut self) -> Result<String, mpsc::error::TryRecvError> { self.rx.try_recv().map(Message::into_text) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn draining_preserves_order_and_releases_byte_budget() {
        let (tx, mut rx) = with_limits(2, 8);
        tx.send("1234".into()).unwrap();tx.send("5678".into()).unwrap();
        assert_eq!(rx.recv().await.as_deref(), Some("1234"));
        assert_eq!(tx.budget.load(Ordering::Relaxed), 4);
        tx.send("abcd".into()).unwrap();
        assert_eq!(rx.recv().await.as_deref(), Some("5678"));
        assert_eq!(rx.recv().await.as_deref(), Some("abcd"));
        assert_eq!(tx.budget.load(Ordering::Relaxed), 0);
        assert!(tx.failure().borrow().is_none());
    }
    #[test]
    fn overflow_is_terminal_and_bounded_by_both_messages_and_bytes() {
        for (count, bytes, text) in [(2, 100, "x"), (10, 8, "1234")] {
            let (tx, mut rx) = with_limits(count, bytes);
            let failed = tx.failure();
            tx.send(text.into()).unwrap();tx.send(text.into()).unwrap();
            assert!(tx.send(text.into()).is_err());assert_eq!(*failed.borrow(), Some(CloseReason::Transport));
            assert_eq!(tx.budget.load(Ordering::Relaxed), 2 * text.len());
            rx.try_recv().unwrap();assert!(tx.send(text.into()).is_err());
            drop(rx);assert_eq!(tx.budget.load(Ordering::Relaxed), 0);
        }
        let (tx, _rx) = with_limits(2, 8);
        assert!(tx.send("oversized".into()).is_err());
        assert_eq!(tx.budget.load(Ordering::Relaxed), 0);
    }
    #[test]
    fn closed_receiver_releases_failed_reservations() {
        let (tx, rx) = with_limits(2, 8);drop(rx);
        assert!(tx.send("lost".into()).is_err());
        assert_eq!(tx.budget.load(Ordering::Relaxed), 0);
    }
}
