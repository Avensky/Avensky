# Staging Open World

Start on the staging site, select your character, then choose **Enter World** and **Continue** in the garage. Select the BRZ at deployment. Stop on clear, level ground before getting out. The same car stays in the room under its parking brake. Walk, run, or jump nearby, select the parked BRZ, and approach either side to get back in. Other players can see you on foot.

| Input | Move | Run | Jump | Enter or exit your BRZ |
| --- | --- | --- | --- | --- |
| Phone | Left move stick | Push the stick farther | Jump button | Get out / Get in BRZ |
| Keyboard | WASD or arrow keys | Hold Shift | Space | F |
| Controller | Left stick | Press the left stick | A | Y |

Drag the scene or use the controller's right stick to look around. Aim near a car or tap it on a phone to select it. Touch can also select scenery. Other cars and scenery can be selected without opening them. Check that the Get in BRZ button enables near a door and stays disabled while in the air or out of reach.

## Scope and release

The staging Rust service advertises on-foot support for listed, unlocked free-drive worlds. An optional server setting, `AVENLAB_HUB_WORLD_ID`, restricts support to one saved world. Assign a main world or point `STAGING_OPEN_WORLD_ID` at that same world for the garage’s **Enter World** station. In staging, the game can also find an eligible listed world when no ID is assigned. Race, combat, private, locked, and production worlds continue to use their existing controls.

## Planned next update — queue from the hub

Players enter through **Character selection → Main menu → Enter World**. From the hub, a player could open **Play**, choose a match, then close the menu and keep driving, walking, or spending time with other players while waiting. A compact queue indicator would reopen the queue or cancel it. A match-ready prompt would offer **Join match** and **Stay here**.

1. Give the matchmaking ticket a lifecycle independent of hub membership. Joining or cancelling a queue should preserve the current character, vehicle, position, and connection to nearby players.
2. Reserve a place in the destination match before transferring the player. Accepting transfers once. Declining, an expired offer, or a full destination leaves the player in the hub. Count a transferring player once toward server capacity.
3. Offer **Return to Open World** after the match. If the previous hub is full or unavailable, offer a destination choice. Reuse the existing menu components and controller actions for the in-world panel.

Verify with two players in the hub. One queues, moves, cancels, and queues again while the other can still see them. Then test accepting, declining, a match that fills during the offer, and reconnecting during transfer. Confirm both players keep their own characters and progression.

## Proposed social and duel rules

- City hubs and repair shops are sanctuaries. Players can meet friends, equip, repair, and form groups there. Incoming duel invitations stay quiet inside sanctuaries, and combat damage stays disabled across the boundary.
- Duel challenges default to off. Turning them on lets nearby players invite you to a duel in eligible outdoor areas. Both players accept and see the rules before a countdown. Spectators and passengers stay outside the duel.
- Start with one-on-one, nonlethal sparring in a marked area. The first player to reach the practice limit loses the round. Surrender, disconnection, or leaving the area ends the duel safely. Restore players and keep their normal outfits, inventory, and Open World progress.
- Keep races, time trials, rescue jobs, and repair meetups available regardless of duel preference. Friends can meet and take on shared challenges without turning on duels.

These are proposed rules. Before staging duels, enforce consent, sanctuary bounds, and duel damage on the server, including both players changing preferences or disconnecting. Test boundary crossings, simultaneous challenges, and nearby nonparticipants.

Publish with the game-enabled staging workflow. It builds the Rust image on Vultr, backs up the staging data volume before replacement, and checks the staging WebSocket before activating the frontend. See [frontend releases](FRONTEND_RELEASES.md#include-the-staging-game-server) and [the scaling architecture](SCALING_ARCHITECTURE.md).

## How the shared room scales

Vehicles and walkers use the same 60 Hz room simulation and static world colliders. The Rust server limits movement speed, checks ground support and clearance at exit, and verifies that the player is grounded beside their own selected BRZ for entry. It stops stale movement and keeps the walker with the vehicle during a reconnect lease. Cars keep their existing packed snapshots. While a room has walkers, a separate coalesced message carries their positions at 15 Hz so the browser can animate between updates. An empty actor update clears walkers when everyone is back in a car.

The browser uses existing driver appearance data and lightweight geometry for on-foot avatars. This avoids a fresh character-model download every time a driver steps out. Staging keeps its existing admission limits across all active worlds. Start with two phones in the same room and measure frame time, WebSocket bytes per second, and server tick duration as each player exits their BRZ.
