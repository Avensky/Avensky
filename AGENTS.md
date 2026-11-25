Codex instructions for Avensky
Project scope
Avensky is the public-facing browser vehicle game engine. Treat Avensky/Avensky as the canonical game repository, separate from AvenLab research. Do not copy private soft-body solvers, vehicle hacking or CAN-bus research, datasets, secrets, or experimental code into this project.
Structure
- frontend/: React, TypeScript, React Three Fiber / Three.js, drivers, garage, wardrobe, poses, vehicles, mobile UI and world editing.
- avenlab-server/: Rust multiplayer server, player sessions, gameplay and match rules.
- packages/wardrobe-catalog/: shared wardrobe and appearance data.
- docs/: alpha readiness, architecture, evidence, and asset provenance.
- Use the existing versioned physics integration boundary rather than importing private engine sources.
Build and validation
- Use Node 24, npm, stable Rust/Cargo and Git LFS.
- Install: npm ci and npm --prefix frontend ci.
- Frontend: npm run build and npm --prefix frontend run typecheck.
- Targeted tests: cd frontend && node --test tests/game-boundary.test.mjs tests/menu-routing.test.mjs tests/pose-pack-import.test.mjs.
- Rust tests: cargo test --locked --manifest-path avenlab-server/Cargo.toml.
- Record executed commands and outcomes. Separate passing code tests from visual verification and device performance.
- For performance changes, supply a reproducible baseline, measurements, parity checks and environmental limits.
Garage presentation
- Sign-in, character selection, Play and Heroes share the authored garage_special.glb and LiveGarage scene. Make garage edits there for all four screens.
Characters and appearance
- Mara Vega and Rook Okafor are the original starter rigs. Preserve save IDs, rigs, existing working animation and network compatibility.
- Repaired 12-style hairstyles have provisional approval only; final approval requires checking actual in-game hair color and opacity.
- Curly hair pack is a candidate pending material fitting, LODs and device tests. Preserve per-style color controls (base, roots, highlights, tips where supported).
- Five Pack 7 tops and five corset components have alpha approval individually, not for all layered outfit pairings.
- Regular skirt/corset contact failures and engine PBR visual checks remain outstanding.
- Keep accepted silhouette, skirt waist heights, hairline, corset lacing, body coverage and animation behavior unless a task explicitly targets them.
- Validate new hair for UVs/opacity, scalp clearance, head turns, hoods, clothing, material color and target mobile performance.
Asset rights
- Do not commit purchased source hair, clothing, character archives, extracted textures or modified commercial models to this public repository without checking redistributable licensing.
- Prefer source-safe fitting code, manifests, tests, import recipes and documentation. Document any assets that are intentionally installed separately.
Workflow
- Make focused branches and PRs. Do not merge unrelated performance, hair, pose and wardrobe tasks.
- Preserve existing saved profile schema and IDs, unless a migration is implemented and tested.
- When a task changes the alpha status, update the relevant README/readiness documentation with remaining blockers.
- Always differentiate candidate, fitted, provisionally approved, fully approved, integrated, tested on a physical device and ready to ship.
