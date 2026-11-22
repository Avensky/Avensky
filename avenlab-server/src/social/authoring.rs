//! Shared content permissions belong to registered profiles configured by the operator.
use super::model::{Profile, SocialData, World};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
pub struct Staff {
    pub master: String,
    pub characters: BTreeSet<String>,
    pub worlds: BTreeSet<String>,
}
#[derive(Clone, Copy, Default, Serialize)]
pub struct Permissions {
    pub game_master: bool,
    pub edit_characters: bool,
    pub edit_main_world: bool,
}
impl Staff {
    pub fn load() -> Self {
        let read = |name| std::env::var(name).unwrap_or_default();
        let team = |name| {
            read(name)
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
                .collect()
        };
        Self {
            master: read("AVENSKY_GAME_MASTER_ID").trim().to_owned(),
            characters: team("AVENSKY_CHARACTER_EDITOR_IDS"),
            worlds: team("AVENSKY_WORLD_EDITOR_IDS"),
        }
    }
    pub fn permissions(&self, profile: &Profile) -> Permissions {
        if profile.account.is_none() {
            return Permissions::default();
        }
        let master = profile.id == self.master;
        Permissions {
            game_master: master,
            edit_characters: master || self.characters.contains(&profile.id),
            edit_main_world: master || self.worlds.contains(&profile.id),
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Driver {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub gender: String,
    pub vehicle: String,
    pub outfit: String,
    pub color: String,
    pub accent: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Authored {
    pub drivers: BTreeMap<String, Driver>,
    pub main_world: Option<usize>,
    pub documents: BTreeMap<usize, Value>,
    pub approved: BTreeMap<usize, String>,
    pub match_sources: BTreeMap<usize, (usize, String)>,
}
impl SocialData {
    pub fn can_edit_world(&self, world: &World, actor: &str, permissions: Permissions) -> bool {
        world.mode.is_none()
            && if self.authored.main_world == Some(world.id) {
                permissions.edit_main_world
            } else {
                world.owner_id.as_deref() == Some(actor)
            }
    }
    pub fn approved_sources(&self, compatible: &[String]) -> Vec<usize> {
        self.authored
            .approved
            .keys()
            .copied()
            .filter(|id| {
                self.worlds.get(id).is_some_and(|w| {
                    w.mode.is_none()
                        && w.listed
                        && w.password_hash.is_none()
                        && compatible.contains(&w.map)
                })
            })
            .collect()
    }
    pub fn match_source(&self, world: usize) -> Option<usize> {
        let (id, revision) = self.authored.match_sources.get(&world)?;
        (self.authored.approved.get(id) == Some(revision)
            && self.worlds.get(id).is_some_and(|source| {
                source.mode.is_none() && source.listed && source.password_hash.is_none()
            }))
        .then_some(*id)
    }
}
