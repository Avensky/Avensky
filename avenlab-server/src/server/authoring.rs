use super::*;
use crate::social::authoring::Driver;

impl Server {
    pub(super) async fn author(
        &self,
        player: &str,
        action: &str,
        value: &Value,
    ) -> Result<Value, String> {
        let actor = self.actor(player).await?;
        let permissions = self
            .staff
            .permissions(self.data.lock().await.profile(&actor)?);
        if action == "roster_save" && !permissions.edit_characters {
            return Err("Character editor permission is required.".into());
        }
        if action != "roster_save" && !permissions.game_master {
            return Err("Only the game master can select official worlds.".into());
        }
        let compatible = if action == "world_approve" && value["enabled"] == true {
            tokio::task::spawn_blocking(crate::harbor::quickplay_maps)
                .await
                .map_err(|_| "Map discovery failed.")?
        } else {
            Vec::new()
        };
        let mut data = self.data.lock().await;
        let previous = data.clone();
        let result = match action {
            "roster_save" => {
                let mut driver: Driver = serde_json::from_value(value["driver"].clone())
                    .map_err(|_| "Invalid driver definition.")?;
                driver.name = valid_name(&driver.name, 32)?;
                crate::alpha::character::validate_driver(&driver)?;
                if driver.id.is_empty() {
                    driver.id = format!("custom-{}-{}", id(), driver.gender);
                } else if let Some(old) = data.authored.drivers.get(&driver.id) {
                    if old.gender != driver.gender {
                        return Err("An existing character keeps its rig.".into());
                    }
                } else if !crate::alpha::character::builtin_driver(&driver.id, &driver.gender) {
                    return Err("Unknown roster character.".into());
                }
                if !data.authored.drivers.contains_key(&driver.id)
                    && data.authored.drivers.len() >= 160
                {
                    return Err("The shared character roster is full.".into());
                }
                let id = driver.id.clone();
                data.authored.drivers.insert(id.clone(), driver);
                json!({"driver_id":id})
            }
            "world_approve" | "world_set_main" => {
                let id = value["world_id"].as_u64().ok_or("Select a saved world.")? as usize;
                let enabled = value["enabled"].as_bool().ok_or("Choose on or off.")?;
                let world = data.worlds.get(&id).ok_or("Unknown world.")?;
                if enabled
                    && (world.mode.is_some() || !world.listed || world.password_hash.is_some())
                {
                    return Err("Choose a listed, unlocked player world.".into());
                }
                if action == "world_set_main" {
                    if enabled {
                        data.authored.main_world = Some(id);
                    } else if data.authored.main_world == Some(id) {
                        data.authored.main_world = None;
                    }
                } else if enabled {
                    if !compatible.contains(&world.map)
                        || data
                            .authored
                            .documents
                            .get(&id)
                            .or_else(|| data.saved_maps.get(&world.map))
                            .is_some_and(|doc| doc["quickplay"]["objective"] != "ctf")
                    {
                        return Err("Choose a world with an installed CTF objective.".into());
                    }
                    data.authored
                        .approved
                        .entry(id)
                        .or_insert_with(crate::social::model::id);
                } else {
                    data.authored.approved.remove(&id);
                }
                json!({"world_id":id})
            }
            _ => return Err("Unknown authoring action.".into()),
        };
        drop(data);
        self.commit(previous).await?;
        Ok(result)
    }
}
