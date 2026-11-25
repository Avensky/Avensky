# Avensky

Avensky is a browser-based game engine for vehicle simulation, world building, and real-time multiplayer.

## Play locally

Use Node 24, npm, stable Rust with Cargo, and Git LFS. A normal clone from a remote that hosts the game models uses these commands.

```sh
git lfs install
git lfs pull
npm ci
npm --prefix frontend ci
npm run dev
```

Open **http://localhost:5174**. Choose **Player profile → Continue as guest**. Open **Heroes** for character appearance, poses and the vehicle garage. Choose **Explore → Sandbox** to select a world and drive. The browser connects to the Rust game server on port 9001.

If you received the transfer bundle, follow its **START-HERE.md** before installing dependencies. Preparing models on first launch takes longer than subsequent launches.

## Wardrobe authoring foundation

The planned deterministic layering, controlled garment fitting, material selection, testing and AI-agent implementation commands are documented in [Wardrobe foundation](docs/wardrobe/README.md). This is a **design specification**, not yet implemented runtime behavior.

## Project boundary

| Part | What belongs here |
| --- | --- |
| Game server | Player sessions, vehicle input, rigid-body gameplay, world state and match rules in `avenlab-server`. |
| Game client | React Three Fiber scenes, vehicle rendering, gamepad and touch controls, characters, wardrobe and poses in `frontend`. |
| Shared game data | Character, wardrobe and appearance catalogs in `packages/wardrobe-catalog`. Both the client and server consume these files. |
| Future packages | A second consumer can extract character behavior, model loading or a simulation interface when it needs the same behavior. Keep private solver implementations and experimental datasets in their own repositories. |

The Rust server consumes the versioned `avenlab-physics` crate. The client receives game state over WebSocket. A future experiment can use the same model or simulation package at that boundary. Soft-body solvers and automotive signal research belong in private projects. Review redistribution rights for each model before a public source release or portfolio deployment.

## Deployment environments

Development, staging, and production use different game WebSocket endpoints and player-data volumes. The production browser client uses `wss://api.avensky.com/ws/`. Staging uses its own endpoint and volume. See [Deployment environments](docs/DEPLOYMENT_ENVIRONMENTS.md) for build modes and the staging Compose file. See [Player accounts and onboarding](docs/PLAYER_ONBOARDING.md) for the staged SQLite migration and rollout.

See [Scaling architecture](docs/SCALING_ARCHITECTURE.md) for the server map, asset pipelines and a first performance experiment.

## Verification

```sh
npm run build
npm --prefix frontend run typecheck
cd frontend && node --test tests/game-boundary.test.mjs tests/menu-routing.test.mjs tests/pose-pack-import.test.mjs
```

Run `cargo test --locked --manifest-path avenlab-server/Cargo.toml` from the root to exercise the Rust game logic. Production hosting needs a WebSocket route at `/ws/` to the Rust server, or a `VITE_RUST_WS_URL` set at build time. This repository does not configure a domain.

## Vesper’s alpha fitting room

The fitting-room pass covers Space Buns & Loose Waves, the villager hairstyle with its hair piece, and Mia Braided Ponytail. The fitted space buns bind to the current actor rig and use a spring with clearance against the moving shoulders and dress. Device outfits keep the hairstyle ID and palette when the fitted assets are installed.

The fitted GLBs are installed separately. The hair and wardrobe catalog entries resolve against the installed models in local development or the verified asset manifest in staging. See [asset clearance](docs/ASSET_CLEARANCE.md) and [private staging assets](docs/CLOUD_ASSETS.md) for the asset release procedure. The scoped shoulder check covered 318 walk poses and 244 steering and pedal poses in the private alpha. Headwear and physical-device performance remain to be verified.

## Credits

Frontend inspiration from Domenicobrz’s R3F-in-practice. The upstream project identifies its code license as MIT. Bundled third-party assets retain their own notices.

- “T-90M (With interior) [FREE]” by DerpDude. [Model](https://skfb.ly/oWGUu) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- “Panzer II (Pz.Kpfw. II)” by vmatthew. [Model](https://skfb.ly/oTOqy) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- “2024 GMC Sierra 1500 AT4X” by Ddiaz Design. The game derivative adjusts pivots and sockets, batches meshes, names paint and simplifies geometry. [Model](https://sketchfab.com/3d-models/2024-gmc-sierra-1500-at4x-41d0b29e3d2f4854a9b6349ccf918a1e) · [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
