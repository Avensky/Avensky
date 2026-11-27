use super::*;
use crate::social::garage::{GarageLayout, SavedGarage};

impl Server {
    /// handle() has already serialized control-plane operations. The account key always
    /// comes from the authenticated socket. Personal furniture never enters social broadcasts.
    pub(super) async fn personal_garage(
        &self,
        player: &str,
        action: &str,
        value: &Value,
    ) -> Result<Value, String> {
        let owner = self.actor(player).await?;
        let mut data = self.data.lock().await;
        let saved = data.profile(&owner)?.garage.as_ref();
        let revision = saved.map_or(0, |s| s.revision);
        let snapshot = || json!({
            "owner": owner, "revision": revision, "layout": saved.map(|s| &s.layout)
        });
        if action == "garage_layout_get" {
            return Ok(snapshot());
        }
        let expected = value["revision"].as_u64().ok_or("Reload your garage before saving.")?;
        let layout: GarageLayout = serde_json::from_value(value["layout"].clone())
            .map_err(|_| "Choose a placement for each garage furnishing.")?;
        if !layout.in_room() {
            return Err("Keep each garage furnishing on the garage floor.".into());
        }
        // A retry after an acknowledgement was lost is already committed.
        if saved.is_some_and(|s| s.layout == layout) {
            return Ok(snapshot());
        }
        if expected != revision {
            let mut result = snapshot();
            result["conflict"] = Value::Bool(true);
            return Ok(result);
        }
        let revision = revision.checked_add(1).ok_or("Garage revision limit reached.")?;
        let previous = data.clone();
        let result = json!({ "owner": owner, "revision": revision, "layout": layout });
        data.profiles.get_mut(&owner).unwrap().garage = Some(SavedGarage { revision, layout });
        drop(data);
        self.commit(previous).await?;
        Ok(result)
    }
}
