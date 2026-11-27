//! Garage furnishings belong to the account, across all its character slots.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Placement {
    x: f64,
    z: f64,
    yaw: f64,
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GarageLayout {
    lockers: Placement,
    desk: Placement,
    shelf: Placement,
    toolbox: Placement,
    jack: Placement,
    crane: Placement,
}

impl GarageLayout {
    pub fn in_room(&self) -> bool {
        [self.lockers, self.desk, self.shelf, self.toolbox, self.jack, self.crane]
            .iter()
            .all(|p| p.x.abs() <= 9.0 && p.z.abs() <= 9.0 && p.yaw.abs() <= std::f64::consts::TAU)
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SavedGarage {
    pub revision: u64,
    pub layout: GarageLayout,
}
