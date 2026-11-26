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
Wardrobe AI-agent rules (mandatory for wardrobe, fitting, clothing materials, layers and outfit UI)
- BEFORE changing wardrobe code, read docs/wardrobe/README.md and its applicable RULES.md, PIPELINE.md, TESTING.md, DECISIONS.md and COMMAND_QUEUE.md. These are the canonical specifications. Inspect the actual current implementation and fixtures as well; proposed design is not implemented behavior.
- Begin each task by identifying the specific W-xx command, baseline commit, affected garment IDs, preserved fit constraints, required tests, and any unavailable source GLBs. If a task is not in the queue, add a concise task/dependency there instead of inventing behavior.
- Follow the agreed moderate-fitting policy: bounded regional deformation, protected lace/eyelets/seams/hardware, signed and visibility-aware clipping checks, and pose-specific verification. Numerical thresholds are proposals until calibrated against full assets. Never stretch an entire garment to hide a localized collision.
- For W-07+ new garment imports, consult `packages/wardrobe-catalog/garment-fit-recipes.v1.json` with the canonical `docs/wardrobe/PIPELINE.md` and `RULES.md`. The recipe currently defines **proposed gates only**, not a production fitter: require real target-body mesh and 88-bone rig evidence; classify soft panels, structured corset cups, follow-parent trim and locked hardware; fit outerwear against the complete selected underlayer shell; reject missing pose tests and preserve accepted topology-bound corrections. Never infer asset readiness from a source screenshot or a unit test.
- Keep geometry and materials independent: change in color/dye/normal/roughness presets does not invoke fitting; actual thickness/mesh/rig/underlayer/closure geometry changes invalidate the fit. Never substitute a tangent-space purple normal map for baseColor.
- Layering must separate saved equipped, resolved active and rendered visible states. A coat must not erase the top underneath it; dress, corset, cuff, belt and boot overrides require explicit modes and fit evidence. Keep historical saves, appearance IDs and dye channels stable.
- Never report garment geometry, mobile performance or visual quality as PASSED when the relevant asset was absent or its test skipped. Distinguish source-code/test validation from rendered preview, animation and physical-phone review.
- AFTER every change: update the owning wardrobe specification if a rule changed; append a short evidence/decision note to docs/wardrobe/DECISIONS.md with the changed files, baseline, commands, test results including skips, quantitative/visual evidence, remaining failure cases and next W-xx step. Link canonical guidance from component READMEs instead of copying it.
- Do not silently approve assets for Hero/NPC use, release commercial assets, merge to main, or deploy live. Keep approval and licensing separate from technical fitting.

Asset rights
- Do not commit purchased source hair, clothing, character archives, extracted textures or modified commercial models to this public repository without checking redistributable licensing.
- Prefer source-safe fitting code, manifests, tests, import recipes and documentation. Document any assets that are intentionally installed separately.
Workflow
- Make focused branches and PRs. Do not merge unrelated performance, hair, pose and wardrobe tasks.
- Preserve existing saved profile schema and IDs, unless a migration is implemented and tested.
- When a task changes the alpha status, update the relevant README/readiness documentation with remaining blockers.
- Always differentiate candidate, fitted, provisionally approved, fully approved, integrated, tested on a physical device and ready to ship.
