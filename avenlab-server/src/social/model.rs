use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

/// Discover installed maps on demand: no environment allow-list to maintain.
pub fn available_maps() -> Vec<String> {
    let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/assets/blocks");
    let mut maps = Vec::new();
    if let Ok(files) = std::fs::read_dir(directory) {
        for entry in files.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|v| v.to_str()) else { continue; };
            let Some(id) = name.strip_suffix("_colliders.json") else { continue; };
            if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') { continue; }
            if let Ok(file) = crate::world::block_colliders::load_block_collider_file(path.to_string_lossy().into_owned()) {
                if file.schema_version == 2 && file.map_id == id { maps.push(id.to_owned()); }
            }
        }
    }
    maps.sort();
    maps
}
pub fn map_available(id: &str) -> bool { available_maps().iter().any(|map| map == id) }
pub const MAX_WORLD_PLAYERS: usize = 10;
pub const MAX_PROFILES: usize = 1024;
pub const MAX_FRIENDS: usize = 100;
pub const MAX_GROUP_MEMBERS: usize = 10;

pub fn id() -> String {
    Uuid::new_v4().simple().to_string()
}
pub fn valid_name(value: &str, max: usize) -> Result<String, String> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > max || name.chars().any(char::is_control) {
        Err(format!(
            "Enter a name with 1–{max} characters and no control characters."
        ))
    } else {
        Ok(name.to_string())
    }
}
pub fn timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    // Device guest credential, never included in any social-state response.
    pub token_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account: Option<super::accounts::Account>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub garage: Option<super::garage::SavedGarage>,
    pub friends: BTreeSet<String>,
    #[serde(default)]
    pub progression: crate::alpha::progression::Progression,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_character: Option<String>,
    /// Empty legacy rosters use the account ID. Once a roster is emptied, the
    /// next character needs a new career ID even if it takes the same name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_character_id: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub characters: BTreeMap<String, SavedCharacter>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SavedCharacter {
    pub name: String,
    pub style: String,
    /// The selected slot uses the profile's existing progression lane.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inactive: Option<crate::alpha::progression::Progression>,
}

impl Profile {
    pub fn career_id(&self) -> &str {
        self.active_character.as_deref().or(self.next_character_id.as_deref()).unwrap_or(&self.id)
    }

    pub fn display_name(&self) -> &str {
        self.characters.get(self.career_id()).map_or(&self.name, |slot| &slot.name)
    }

    pub fn character_owner(&self) -> Option<String> {
        (self.career_id() != self.id).then(|| self.id.clone())
    }

    pub fn character_progression(&mut self, id: &str) -> Option<&mut crate::alpha::progression::Progression> {
        if self.career_id() == id { return Some(&mut self.progression); }
        self.characters.get_mut(id)?.inactive.as_mut()
    }

    pub fn player_view(&self, slots_enabled: bool) -> serde_json::Value {
        let mut view = serde_json::json!({
            "id": self.id, "name": self.display_name(), "account_display_name": self.name,
            "progression": self.progression.view()
        });
        if slots_enabled {
            let characters: Vec<_> = self.characters.iter().map(|(id, slot)| {
                let progression = slot.inactive.as_ref().unwrap_or(&self.progression);
                serde_json::json!({
                    "id": id, "name": slot.name, "style": slot.style, "level": progression.level,
                    "appearance": progression.equipped_character()
                })
            }).collect();
            view["active_character_id"] = serde_json::json!(self.active_character);
            view["characters"] = serde_json::json!(characters);
        }
        view
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub owner_id: String,
    pub members: BTreeSet<String>,
    pub invited: BTreeSet<String>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct World {
    #[serde(default)]
    pub tire_thermals: bool,
    #[serde(default)]
    pub mode: Option<crate::alpha::Mode>,
    pub id: usize,
    pub name: String,
    pub map: String,
    pub owner_id: Option<String>,
    pub listed: bool,
    pub max_players: usize,
    pub password_hash: Option<String>,
    pub invite_code: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct WorldInvite {
    pub id: String,
    pub from: String,
    pub to: String,
    pub world_id: usize,
    pub expires: u64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SocialData {
    #[serde(default)]
    pub authored: super::authoring::Authored,
    #[serde(default = "id")]
    pub server_id: String,
    pub version: u8,
    pub next_world: usize,
    pub profiles: BTreeMap<String, Profile>,
    pub friend_requests: BTreeSet<(String, String)>,
    pub groups: BTreeMap<String, Group>,
    pub worlds: BTreeMap<usize, World>,
    /// Authoritative, validated editor documents shared by every player and
    /// reloaded by the server after a restart. Browser drafts remain private.
    #[serde(default)]
    pub saved_maps: BTreeMap<String, serde_json::Value>,
    /// Validated factory-relative vehicle tuning, explicitly published from
    /// the editor. New spawns in every world adopt these server defaults.
    #[serde(default)]
    pub vehicle_defaults: BTreeMap<String, serde_json::Map<String,serde_json::Value>>,
    pub world_invites: Vec<WorldInvite>,
    #[serde(default)]
    pub completed_results: BTreeSet<String>,
}
impl Default for SocialData {
    fn default() -> Self {
        Self {
            authored: Default::default(),
            server_id: id(),
            version: 1,
            next_world: 1,
            profiles: BTreeMap::new(),
            friend_requests: BTreeSet::new(),
            groups: BTreeMap::new(),
            worlds: BTreeMap::new(),
            saved_maps: BTreeMap::new(),
            vehicle_defaults: BTreeMap::new(),
            world_invites: Vec::new(),
            completed_results: BTreeSet::new(),
        }
    }
}
impl SocialData {
    pub fn load(path: &std::path::Path) -> anyhow::Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let bytes = std::fs::read(path)?;
        anyhow::ensure!(
            bytes.len() <= 32 * 1024 * 1024,
            "Social data file is too large"
        );
        Self::decode(&bytes)
    }

    pub(super) fn decode(bytes: &[u8]) -> anyhow::Result<Self> {
        let mut data: Self = serde_json::from_slice(bytes)?;
        anyhow::ensure!(
            data.version == 1
                && data.profiles.len() <= MAX_PROFILES
                && data.worlds.len() <= 256
                && data.saved_maps.len() <= 8
                && data.vehicle_defaults.len() <= 64
                && data.groups.len() <= 256,
            "Unsupported or oversized social data"
        );
        data.world_invites
            .retain(|invite| invite.expires > timestamp());
        // IDs never reuse a saved world's number after a restart.
        data.next_world = data
            .next_world
            .max(data.worlds.keys().last().copied().unwrap_or(0) + 1);
        Ok(data)
    }
    pub fn profile(&self, id: &str) -> Result<&Profile, String> {
        self.profiles
            .get(id)
            .ok_or_else(|| "Choose a player profile first.".into())
    }
    pub fn groups_for(&self, id: &str) -> impl Iterator<Item = &Group> {
        self.groups
            .values()
            .filter(move |group| group.members.contains(id))
    }
    pub fn authenticate(
        &mut self,
        token: Option<&str>,
        name: &str,
    ) -> Result<(String, Option<String>), String> {
        if let Some(token) = token {
            if token.len() != 64 {
                return Err(
                    "This player credential is invalid. Create a new profile on this device."
                        .into(),
                );
            }
            let hash = super::security::token_hash(token);
            return self
                .profiles
                .values()
                .find(|profile| profile.account.as_ref().map_or_else(|| profile.token_hash == hash, |account| account.accepts(&hash)))
                .map(|profile| (profile.id.clone(), None))
                .ok_or_else(|| {
                    "This profile is unavailable on this server. Create a new device profile."
                        .into()
                });
        }
        if self.profiles.len() >= MAX_PROFILES {
            return Err("This server has reached its profile limit.".into());
        }
        let name = valid_name(name, 24)?;
        let profile_id = id();
        let token = format!("{}{}", id(), id());
        self.profiles.insert(
            profile_id.clone(),
            Profile {
                id: profile_id.clone(),
                name,
                token_hash: super::security::token_hash(&token),
                account: None,
                garage: None,
                friends: BTreeSet::new(),
                progression: Default::default(),
                active_character: None,
                next_character_id: None,
                characters: BTreeMap::new(),
            },
        );
        Ok((profile_id, Some(token)))
    }
}
