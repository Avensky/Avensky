# Avensky · Redline Vector

Avensky is a browser-based 3D vehicle game. Pick a driver, fit an outfit in the garage, then choose a vehicle and a map for a practice session. Quickplay and Competitive use the server’s capture-the-flag rules. The world editor places roads and props in the game environment.

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

## Project boundary

| Part | What belongs here |
| --- | --- |
| Game server | Player sessions, vehicle input, rigid-body gameplay, world state and match rules in `avenlab-server`. |
| Game client | React Three Fiber scenes, vehicle rendering, gamepad and touch controls, characters, wardrobe and poses in `frontend`. |
| Shared game data | Character, wardrobe and appearance catalogs in `packages/wardrobe-catalog`. Both the client and server consume these files. |
| Future packages | A second consumer can extract character behavior, model loading or a simulation interface when it needs the same behavior. Keep private solver implementations and experimental datasets in their own repositories. |

The Rust server consumes the versioned `avenlab-physics` crate. The client receives game state over WebSocket. A future experiment can use the same model or simulation package at that boundary. Soft-body solvers and automotive signal research belong in private projects. Review redistribution rights for each model before a public source release or portfolio deployment.

## Verification

```sh
npm run build
npm --prefix frontend run typecheck
cd frontend && node --test tests/game-boundary.test.mjs tests/menu-routing.test.mjs tests/pose-pack-import.test.mjs
```

Run `cargo test --locked --manifest-path avenlab-server/Cargo.toml` from the root to exercise the Rust game logic. Production hosting needs a WebSocket route at `/ws/` to the Rust server, or a `VITE_RUST_WS_URL` set at build time. This repository does not configure a domain.

## Credits

Frontend inspiration from Domenicobrz’s R3F-in-practice. The upstream project identifies its code license as MIT. Bundled third-party assets retain their own notices.

- “T-90M (With interior) [FREE]” by DerpDude. [Model](https://skfb.ly/oWGUu) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- “Panzer II (Pz.Kpfw. II)” by vmatthew. [Model](https://skfb.ly/oTOqy) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- “2024 GMC Sierra 1500 AT4X” by Ddiaz Design. The game derivative adjusts pivots and sockets, batches meshes, names paint and simplifies geometry. [Model](https://sketchfab.com/3d-models/2024-gmc-sierra-1500-at4x-41d0b29e3d2f4854a9b6349ccf918a1e) · [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
