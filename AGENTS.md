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
- For sign-in, character selection, creation, Profile, or their menu handoffs, read [the approved menu guide](docs/MENU_DESIGN.md). It records the shared controls, visual rules, scene ownership, and acceptance checks to carry into the final game.
- Use the shared angled header components and theme styles for menu changes. Center the brand in the painted tab face, give joined tabs a continuous themed top edge and a single themed divider, and preserve the larger mobile touch target. Check both orientations when a shared header changes.
- Keep the two corner tabs prominent and the inner tabs shorter. Use the shared face heights, spacing and safe-area padding across the roster, Profile and creator. The A-shaped brand mark supplies the initial letter. Profile transitions retain the selected actor and its current gesture. Show pending work in the UI layer.
- Treat the Garage as the player's private room and its four stations as the menu. Keep one garage canvas, carry the selected actor and vehicle forward, and introduce detail as the player reaches each stage.
- Enter World is a visible departure. Begin preparing the admitted destination while the actor boards, drive through the real shutter, and reveal gameplay after its first map frame. Exercise this on a cold load and during a failed admission.
- Keep new workshop props editable and their labels and collision footprints attached to their placements. Preserve the open center and the drive lane in default layouts. See the layout and handoff checks in the menu guide.
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
