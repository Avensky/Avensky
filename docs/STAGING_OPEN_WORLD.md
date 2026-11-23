# Staging Open World

Start on the staging site, select a driver and a BRZ, and join **Open World**. Stop on clear, level ground before getting out. The same car stays in the room under its parking brake. Walk, run, or jump nearby, select the parked BRZ, and approach either side to get back in. Other players can see you on foot.

| Input | Move | Run | Jump | Enter or exit your BRZ |
| --- | --- | --- | --- | --- |
| Phone | Left move stick | Push the stick farther | Jump button | Get out / Get in BRZ |
| Keyboard | WASD or arrow keys | Hold Shift | Space | F |
| Controller | Left stick | Press the left stick | A | Y |

Drag the scene or use the controller's right stick to look around. Aim near a car or tap it on a phone to select it. Touch can also select scenery. Other cars and scenery can be selected without opening them. Check that the Get in BRZ button enables near a door and stays disabled while in the air or out of reach.

## Scope and release

The staging Rust service advertises on-foot support for listed, unlocked free-drive worlds. An optional server setting, `AVENLAB_HUB_WORLD_ID`, restricts support to one saved world. Use an assigned main world or point `STAGING_OPEN_WORLD_ID` at that same world for the main menu shortcut. In staging, the shortcut can also find an eligible listed world when no ID is assigned. Race, combat, private, locked, and production worlds continue to use their existing controls.

Publish with the game-enabled staging workflow. It builds the Rust image on Vultr, backs up the staging data volume before replacement, and checks the staging WebSocket before activating the frontend. See [frontend releases](FRONTEND_RELEASES.md#include-the-staging-game-server) and [the scaling architecture](SCALING_ARCHITECTURE.md).

## How the shared room scales

Vehicles and walkers use the same 60 Hz room simulation and static world colliders. The Rust server limits movement speed, checks ground support and clearance at exit, and verifies that the player is grounded beside their own selected BRZ for entry. It stops stale movement and keeps the walker with the vehicle during a reconnect lease. Cars keep their existing packed snapshots. While a room has walkers, a separate coalesced message carries their positions at 15 Hz so the browser can animate between updates. An empty actor update clears walkers when everyone is back in a car.

The browser uses existing driver appearance data and lightweight geometry for on-foot avatars. This avoids a fresh character-model download every time a driver steps out. Staging keeps its existing admission limits across all active worlds. Start with two phones in the same room and measure frame time, WebSocket bytes per second, and server tick duration as each player exits their BRZ.
