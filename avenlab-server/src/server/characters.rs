use super::*;
use crate::alpha::character::{CharacterChoice, STARTER_STYLES};

const MAX_CHARACTERS: usize = 4;

fn character_name(raw: &str) -> Result<String, String> {
    let name = raw.split(' ').filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" ");
    if (2..=24).contains(&name.len())
        && name.as_bytes()[0].is_ascii_alphabetic()
        && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || b" -'".contains(&byte))
    {
        Ok(name)
    } else {
        Err("Use 2 to 24 letters, numbers, spaces, apostrophes or hyphens. Start with a letter.".into())
    }
}

fn style_choice(style: &str, body: &str) -> Result<CharacterChoice, String> {
    let rig = match body {
        "female" => "mara-vega",
        "male" => "jules-okafor",
        _ => return Err("Choose a body for your character.".into()),
    };
    let entry = STARTER_STYLES.iter().find(|entry| entry["id"] == style)
        .ok_or("Choose a starter style.")?;
    let outfit = &entry[body];
    let choice: CharacterChoice = serde_json::from_value(json!({
        "id": rig, "identity": body, "outfit": outfit["outfit"],
        "appearance": {
            "hair": "natural", "hair_color": "original", "skin": "original", "headwear": "none",
            "color": outfit["color"], "accent": outfit["accent"], "personality": entry["attitude"]
        }
    })).map_err(|_| "The starter style is unavailable.")?;
    if !choice.is_equippable() { return Err("The starter style is unavailable.".into()); }
    Ok(choice)
}

fn delete_character(profile: &mut Profile, slot_id: &str, confirmation: &str) -> Result<(), String> {
    let slot = profile.characters.get(slot_id).ok_or("Choose one of your saved characters.")?;
    if confirmation.is_empty() || slot.name != confirmation {
        return Err("Type the character’s name exactly as shown.".into());
    }
    if profile.active_character.as_deref() == Some(slot_id) {
        let remaining = profile.characters.iter_mut().find(|(id, _)| id.as_str() != slot_id);
        if let Some((next_id, next)) = remaining {
            profile.progression = next.inactive.take().ok_or("Your other saved character is unavailable.")?;
            profile.active_character = Some(next_id.clone());
        } else {
            profile.progression = Default::default();
            profile.active_character = None;
            profile.next_character_id = Some(id());
        }
    }
    profile.characters.remove(slot_id);
    Ok(())
}

impl Server {
    pub(super) async fn handle_character_slots(&self, player: &str, value: &Value) -> Result<Value, String> {
        if !self.player_accounts_enabled() { return Err("Saved characters are unavailable on this server.".into()); }
        let actor = self.actor(player).await?;
        let text = |field: &str| value[field].as_str().unwrap_or_default();
        let action = text("action");
        let creating = matches!(action, "character_create" | "character_create_styled");
        let requested = text("character_id");
        if action == "character_select" {
            let data = self.data.lock().await;
            let profile = data.profile(&actor)?;
            if profile.active_character.as_deref() == Some(requested) {
                return Ok(json!({ "profile": profile.player_view(true) }));
            }
        }
        let in_world = self.connections.lock().await.get(player).is_some_and(|client| client.world_id.is_some());
        let busy = {
            let alpha = self.alpha.lock().await;
            alpha.queue.iter().any(|ticket| ticket.player == player)
                || alpha.reservations.get(&actor).is_some_and(|lease| lease.expires > timestamp())
        };
        if in_world || busy { return Err("Leave your active world or queue before changing characters.".into()); }

        let mut data = self.data.lock().await;
        let previous = data.clone();
        let new_slot = if creating {
            let profile = data.profile(&actor)?;
            let limit = if profile.account.is_some() { MAX_CHARACTERS } else { 1 };
            if profile.characters.len() >= limit {
                return Err(if limit == 1 { "Register to create another character." } else { "All four character slots are in use." }.into());
            }
            let name = character_name(text("name"))?;
            if data.profiles.values().flat_map(|profile| profile.characters.values())
                .any(|slot| slot.name.eq_ignore_ascii_case(&name))
            {
                return Err("That character name is already in use on this server.".into());
            }
            let style = text("style").to_owned();
            let first = profile.active_character.is_none();
            let starter = if first && style == "original" {
                profile.progression.equipped_character().cloned().ok_or("Choose a starter style.")?
            } else {
                style_choice(&style, text("body"))?
            };
            // Validate the entire draft before switching slots. The previous client
            // sends no preview and still uses the server's original preset.
            let choice = if action == "character_create_styled" {
                let draft: CharacterChoice = serde_json::from_value(value["character"].clone())
                    .map_err(|_| "Choose an available character appearance.")?;
                if !draft.is_equippable() || !draft.has_starter_identity(&starter) {
                    return Err("The character appearance does not match the selected starter.".into());
                }
                draft
            } else {
                starter
            };
            Some((if first { profile.career_id().to_owned() } else { id() }, SavedCharacter { name, style, inactive: None }, choice))
        } else {
            None
        };
        let profile = data.profiles.get_mut(&actor).ok_or("Profile unavailable.")?;
        let revision = profile.progression.cosmetics_revision.saturating_add(1);
        if let Some((slot_id, slot, choice)) = new_slot {
            if let Some(active) = profile.active_character.as_ref() {
                let old = profile.characters.get_mut(active).ok_or("Your active character is unavailable.")?;
                old.inactive = Some(std::mem::take(&mut profile.progression));
            }
            profile.progression.character = Some(choice);
            profile.characters.insert(slot_id.clone(), slot);
            profile.active_character = Some(slot_id);
            profile.next_character_id = None;
        } else if action == "character_delete" {
            delete_character(profile, requested, text("confirmation_name"))?;
        } else {
            let next = profile.characters.get_mut(requested).and_then(|slot| slot.inactive.take())
                .ok_or("Choose one of your saved characters.")?;
            let active = profile.active_character.as_ref().and_then(|id| profile.characters.get_mut(id))
                .ok_or("Your active character is unavailable.")?;
            active.inactive = Some(std::mem::replace(&mut profile.progression, next));
            profile.active_character = Some(requested.to_owned());
        }
        profile.progression.cosmetics_revision = revision;
        let response = json!({ "profile": profile.player_view(true) });
        drop(data);
        self.commit(previous).await?;
        Ok(response)
    }
}
