//! Staging free-drive rooms can retain a parked BRZ and move its driver on foot.
use crate::physics::{PhysicsWorld, SIMULATION_DT};
use rapier3d::{control::KinematicCharacterController, prelude::*};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const RADIUS: f32 = 0.29;
const HALF_SEGMENT: f32 = 0.52;
const CENTER: f32 = RADIUS + HALF_SEGMENT;
const WALK: f32 = 2.45;
const RUN: f32 = 5.15;
const INPUT_TICKS: u64 = 18;

pub fn available(world: &crate::social::model::World) -> bool {
    world.mode.is_none() && world.listed && world.password_hash.is_none()
        && std::env::var("AVENLAB_ENV").as_deref() == Ok("staging")
        && std::env::var("AVENLAB_HUB_WORLD_ID").ok()
            .is_none_or(|value| value.parse::<usize>().ok() == Some(world.id))
}

#[derive(Deserialize, Default)]
pub struct Motion {
    x: f32,
    z: f32,
    #[serde(default)]
    run: bool,
    #[serde(default)]
    jump: u32,
}

struct Walker {
    feet: Vector<f32>,
    grounded_at: Vector<f32>,
    yaw: f32,
    vertical: f32,
    speed: f32,
    grounded: bool,
    motion: Motion,
    last_input: Option<u64>,
    jump: u32,
}

#[derive(Serialize)]
struct Actor<'a> {
    id: &'a str,
    feet: [f32; 3],
    yaw: f32,
    speed: f32,
    grounded: bool,
}

#[derive(Default)]
pub struct Hub {
    walkers: HashMap<String, Walker>,
    sent_empty_frame: bool,
}

fn supported_exit(physics: &PhysicsWorld, player: &str) -> Option<(Vector<f32>, f32)> {
    let vehicle = physics.vehicles.get(player)?;
    let body = physics.bodies.get(vehicle.body)?;
    if body.linvel().norm() > 1.0 || (body.rotation() * Vector::y()).y < 0.8 {
        return None;
    }
    let shape = Capsule::new_y(HALF_SEGMENT, RADIUS);
    for side in [1.0, -1.0] {
        let offset = body.rotation() * Vector::new(side * (vehicle.config.chassis_half_extents[0] + 0.55), 0.6, -0.18);
        let origin = Point::from(*body.translation() + offset);
        let filter = QueryFilter::default().exclude_sensors().exclude_rigid_body(vehicle.body);
        let Some((_, hit)) = physics.query_pipeline.cast_ray_and_get_normal(&physics.bodies, &physics.colliders,
            &Ray::new(origin, -Vector::y()), 2.7, false, filter) else { continue; };
        if hit.normal.y < 0.68 || hit.time_of_impact < 0.1 { continue; }
        let feet = origin.coords - Vector::y() * (hit.time_of_impact - 0.025);
        let center = Isometry::translation(feet.x, feet.y + CENTER, feet.z);
        if physics.query_pipeline.intersection_with_shape(&physics.bodies, &physics.colliders, &center, &shape,
            QueryFilter::default().exclude_sensors()).is_none() {
            let forward = body.rotation() * Vector::z();
            return Some((feet, forward.x.atan2(forward.z)));
        }
    }
    None
}

impl Hub {
    pub fn walking(&self, id: &str) -> bool { self.walkers.contains_key(id) }
    pub fn remove(&mut self, id: &str) { self.walkers.remove(id); }
    pub fn suspend(&mut self, id: &str) {
        if let Some(walker) = self.walkers.get_mut(id) {
            walker.last_input = None;
            walker.motion = Motion::default();
        }
    }
    pub fn resume(&mut self, old: &str, new: &str) {
        if let Some(mut walker) = self.walkers.remove(old) {
            walker.last_input = None;
            walker.motion = Motion::default();
            walker.jump = 0;
            self.walkers.insert(new.into(), walker);
        }
    }

    pub fn input(&mut self, id: &str, mut motion: Motion, tick: u64) {
        if !motion.x.is_finite() || !motion.z.is_finite() { return; }
        if let Some(actor) = self.walkers.get_mut(id) {
            motion.x = motion.x.clamp(-1.0, 1.0);
            motion.z = motion.z.clamp(-1.0, 1.0);
            actor.motion = motion;
            actor.last_input = Some(tick);
        }
    }

    pub fn interact(&mut self, id: &str, target: Option<&str>, physics: &mut PhysicsWorld) -> Result<(), &'static str> {
        if physics.is_defeated(id) { return Err("Wait for your BRZ to recover."); }
        let vehicle = physics.vehicles.get(id).ok_or("Spawn your BRZ first.")?;
        let body = physics.bodies.get(vehicle.body).ok_or("The BRZ is unavailable.")?;
        if body.linvel().norm() > 1.0 || (body.rotation() * Vector::y()).y < 0.8 {
            return Err("Stop your BRZ on its wheels first.");
        }
        if let Some(actor) = self.walkers.get(id) {
            if target != Some(id) { return Err("Select your parked BRZ."); }
            let nearby = [1.0, -1.0].into_iter().any(|side| {
                let door = *body.translation() + body.rotation() * Vector::new(
                    side * (vehicle.config.chassis_half_extents[0] + 0.12), 0.0, -0.18);
                let delta = actor.feet - door;
                if delta.x.hypot(delta.z) >= 1.65 || delta.y.abs() >= 1.25 { return false; }
                let origin = actor.feet + Vector::y() * 0.68;
                let reach = door - origin;
                let distance = reach.norm();
                distance < 0.1 || physics.query_pipeline.cast_ray(&physics.bodies, &physics.colliders,
                    &Ray::new(Point::from(origin), reach / distance), distance - 0.07, true,
                    QueryFilter::default().exclude_sensors().exclude_rigid_body(vehicle.body)).is_none()
            });
            if !actor.grounded || !nearby { return Err("Stand beside your BRZ door."); }
            self.remove(id);
        } else {
            let (feet, yaw) = supported_exit(physics, id).ok_or("No clear ground beside your BRZ.")?;
            self.walkers.insert(id.into(), Walker { feet, grounded_at: feet, yaw, vertical: 0.0,
                speed: 0.0, grounded: true, motion: Motion::default(), last_input: None, jump: 0 });
            park(physics, id);
        }
        Ok(())
    }

    pub fn step(&mut self, physics: &PhysicsWorld, tick: u64) {
        if self.walkers.is_empty() { return; }
        let controller = KinematicCharacterController::default();
        let shape = Capsule::new_y(HALF_SEGMENT, RADIUS);
        let dt = SIMULATION_DT;
        for walker in self.walkers.values_mut() {
            let fresh = walker.last_input.is_some_and(|last| tick.saturating_sub(last) <= INPUT_TICKS);
            let direction = if fresh {
                let intent = Vector::new(walker.motion.x, 0.0, walker.motion.z);
                intent / intent.norm().max(1.0)
            } else { Vector::zeros() };
            if walker.motion.jump != walker.jump {
                walker.jump = walker.motion.jump;
                if fresh && walker.grounded { walker.vertical = 5.15; walker.grounded = false; }
            }
            walker.vertical = (walker.vertical - 14.5 * dt).max(-24.0);
            let pace = if walker.motion.run { RUN } else { WALK };
            let prior = walker.feet;
            let position = Isometry::translation(prior.x, prior.y + CENTER, prior.z);
            let movement = controller.move_shape(dt, &physics.bodies, &physics.colliders, &physics.query_pipeline,
                &shape, &position, (direction * pace + Vector::y() * walker.vertical) * dt,
                QueryFilter::default().exclude_sensors(), |_| {});
            walker.feet += movement.translation;
            walker.grounded = movement.grounded;
            if walker.grounded {
                walker.grounded_at = walker.feet;
                if walker.vertical < 0.0 { walker.vertical = 0.0; }
            } else if walker.vertical > 0.0 && movement.translation.y < walker.vertical * dt * 0.55 {
                walker.vertical = 0.0;
            }
            walker.speed = movement.translation.x.hypot(movement.translation.z) / dt;
            if direction.norm_squared() > 0.01 { walker.yaw = direction.x.atan2(direction.z); }
            if walker.feet.y < walker.grounded_at.y - 18.0 {
                walker.feet = walker.grounded_at;
                walker.vertical = 0.0;
            }
        }
    }

    pub fn frame(&mut self, world: usize, tick: u64, connected: impl Fn(&str) -> bool) -> Option<String> {
        let actors: Vec<_> = self.walkers.iter().filter(|(id, _)| connected(id)).map(|(id, actor)| Actor {
            id, feet: [actor.feet.x, actor.feet.y, actor.feet.z], yaw: actor.yaw, speed: actor.speed, grounded: actor.grounded,
        }).collect();
        if actors.is_empty() && self.sent_empty_frame { return None; }
        self.sent_empty_frame = actors.is_empty();
        Some(serde_json::json!({"type":"hub_actors","world_id":world,"tick":tick,"actors":actors}).to_string())
    }
}

pub fn park(physics: &mut PhysicsWorld, id: &str) {
    if let Some(car) = physics.vehicles.get_mut(id) {
        car.throttle = 0.0;
        car.steer = 0.0;
        car.brake = 1.0;
        car.handbrake = 1.0;
        car.powertrain.boost_requested = false;
        car.ram.cancel();
    }
    if let Some(combat) = physics.combat_poses.get_mut(id) { combat.fire = false; combat.ram = false; }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn walks_runs_jumps_and_expires_unrefreshed_input() {
        let mut physics = PhysicsWorld::new();
        physics.colliders.insert(ColliderBuilder::cuboid(20.0, 0.2, 20.0)
            .translation(Vector::new(0.0, -0.2, 0.0)).build());
        physics.query_pipeline.update(&physics.colliders);
        let mut hub = Hub::default();
        let feet = Vector::new(0.0, 0.025, 0.0);
        hub.walkers.insert("avatar".into(), Walker { feet, grounded_at: feet, yaw: 0.0, vertical: 0.0,
            speed: 0.0, grounded: true, motion: Motion::default(), last_input: None, jump: 0 });
        for tick in 0..60 {
            hub.input("avatar", Motion { x: 0.0, z: 1.0, run: false, jump: 0 }, tick);
            hub.step(&physics, tick);
        }
        let walked = hub.walkers["avatar"].feet.z;
        assert!(walked > 2.2 && walked < 2.6, "{walked}");
        for tick in 60..120 {
            hub.input("avatar", Motion { x: 0.0, z: 1.0, run: true, jump: 0 }, tick);
            hub.step(&physics, tick);
        }
        assert!(hub.walkers["avatar"].feet.z - walked > 4.7);
        let mut max_jump: f32 = 0.0;
        for tick in 120..205 {
            hub.input("avatar", Motion { jump: 1, ..Motion::default() }, tick);
            hub.step(&physics, tick);
            max_jump = max_jump.max(hub.walkers["avatar"].feet.y);
        }
        assert!(max_jump > 0.7 && hub.walkers["avatar"].grounded);
        hub.input("avatar", Motion { x: 1.0, ..Motion::default() }, 205);
        for tick in 205..245 { hub.step(&physics, tick); }
        assert!(hub.walkers["avatar"].feet.x > 0.3);
        assert!(hub.walkers["avatar"].speed < 0.001);
    }

    #[test]
    fn leaving_parks_the_brz_and_reentry_requires_the_selected_own_car() {
        let mut physics = PhysicsWorld::new();
        physics.select_map("road_precision").unwrap();
        physics.spawn_vehicle_for_player("owner".into(), [0.0; 3], "brz", "blue").unwrap();
        for _ in 0..60 { park(&mut physics, "owner"); physics.step(SIMULATION_DT); }
        let mut hub = Hub::default();
        hub.interact("owner", None, &mut physics).unwrap();
        assert_eq!(physics.vehicles["owner"].throttle, 0.0);
        assert!(hub.walking("owner"));
        assert!(hub.interact("owner", Some("another-car"), &mut physics).is_err());
        let beside = hub.walkers["owner"].feet;
        hub.walkers.get_mut("owner").unwrap().feet.x += 12.0;
        assert!(hub.interact("owner", Some("owner"), &mut physics).is_err());
        hub.walkers.get_mut("owner").unwrap().feet = beside;
        hub.interact("owner", Some("owner"), &mut physics).unwrap();
        assert!(!hub.walking("owner"));
        assert!(physics.vehicles.contains_key("owner"));
    }
}
