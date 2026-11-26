# Future implementation command queue

**Status:** Planned, not executed. Execute in small reviewable tasks. Human/AI implementers start at [README.md](README.md), follow [RULES.md](RULES.md), [PIPELINE.md](PIPELINE.md) and [TESTING.md](TESTING.md). No automatic merges or production deployment.

**Global prompt for every task:** Inspect current Avensky main/branch files before editing; preserve source asset bytes, user save IDs and authored material channels; implement the smallest coherent change on a review branch; run relevant tests including full assets where needed; document exact changed files, baseline, measurements, skips, regressions, unresolved issues and one next action in [DECISIONS.md](DECISIONS.md). Consolidate existing README content rather than duplicating; link to source-of-truth rules. Do not merge or deploy without review.

## Foundation: do in order

- **W-01 — Baseline audit.** Inventory catalog, active garment slots, saved profiles, client and Rust validation, current replacement logic, material channels, Vesper donor, installed fit fixtures and precise regression failures. Pin a commit and produce baseline measurements.
- **W-02 — Consolidate docs.** Audit root, catalog and character READMEs, check all links, collapse duplicated wardrobe descriptions into canonical docs, mark superseded behavior, repair stale links; preserve component-specific setup commands.
- **W-03 — Shared layer schema (implemented on review branch).** Versioned `layer-rules.json`, JSON Schema, pure semantic validator, 9 passing Node24 contract tests and CI gate. **Not merged or integrated with runtime**; treat class relationships as unapproved fitting candidates. [Draft PR #90](https://github.com/Avensky/Avensky/pull/90).
- **W-04 — Pure deterministic resolver (implemented, awaiting review).** [Draft PR #92](https://github.com/Avensky/Avensky/pull/92) adds deterministic region DAGs, modes, conflict/fit evidence and dependent/visibility outputs. [CI](https://github.com/Avensky/Avensky/actions/runs/45743026433) passed **26 tests, 0 failed, 0 skipped**. **Unmerged; do not connect live selection before W-05.**
- **W-05 — Implemented and CI-verified; awaiting review.** [Draft PR #94](https://github.com/Avensky/Avensky/pull/94) adds optional reversible `wardrobeLayers` v1 sidecar, shared old/layered fixture, strict Rust validation, real browser-storage round trips. [CI run](https://github.com/Avensky/Avensky/actions/runs/45757119689): Node **7/7**, Rust **3/3**, browser **1/1**, all passing. Does **not** change live rendering, equip behavior, or stored legacy records without explicit opt-in.
- **W-06 — Phase 1 implemented, awaiting review.** [Draft PR #97](https://github.com/Avensky/Avensky/pull/97) adds an opt-in read-only stack inspector in Layers, grouped compatibility diagnostics, and an inspection-only Outerwear section (retired `coat-01` cannot be equipped). CI to verify camera/save stability and mobile-safe styles. Phase 2: explicit mode controls and staging verification **after W-07 fit evidence**; no automatic equip/save behavior.

## Garment compatibility / geometry

- **W-07 — Coats/jackets.** Support coat over top/corset/dress with open/closed modes, composite-shell fit, cuff/collar/hem protection and exposure/occlusion tests.
- **W-08 — Top + corset.** Introduce `over-top` and `direct` selections and explicit skirt `tucked` / `over` waist relation; preserve Laced Bodice, Underbust and High Collar regression fixtures.
- **W-09 — Dress/gown + coat/tunic+pants.** Validated special layers, independent gown sleeve/hem and lining behavior; block unapproved full-gown/trousers pairings.
- **W-10 — Pants fitting.** Add supported discovery, pelvis/crotch/knee/ankle profiles and seated/driving motion validation; preserve waistband, seams and pocket shapes.
- **W-11 — Shoes/socks/stockings.** Add supported shoe discovery, foot/socket alignment, left/right consistency, sole/ground and pedal checks, exclusive boot-cuff fit modes.
- **W-12 — Accessories.** Add belt-under/over-coat, glove cuff, scarf/collar, hood/hair, harness and armor contact profiles with explicit conflict reasons.
- **W-13 — Visibility optimization.** Pose-aware, opacity-aware skin/underlayer occlusion; do not permanently remove underlying mesh data; test open coats, lace, split skirts and missing-skin regressions.

## Intake / materials / QA / performance

- **W-14 — Body profiles.** Generate canonical body surface and rig measurements from installed source assets; fitted deterministic region landmarks, source hashes, repeatable output; extend to additional body types after female donor passes.
- **W-15 — Collision/pose QA.** Build signed penetration, contact-map, local-stretch, self-intersection, protected-mask and pose reporting for both GLB tiers; never count skipped asset-dependent tests as success.
- **W-16 — Texture inventory.** Discover maps, identify packed channels and color spaces, deduplicate hashes, classify material families with confidence, protect licensed commercial source files.
- **W-17 — Hero/NPC grading.** Compare actual fitted garment + texture/normal/roughness under three lighting environments, mobile and desktop; calculate proposed weighted score; never use score as legal clearance.
- **W-18 — Automatic discovery.** Extend existing scanner for new garment classes, auto-generated candidate metadata and review manifest without overriding curated stable IDs.
- **W-19 — Precompute/LOD/performance.** Bake repeatable garage/mobile fits and cheaper distant NPC tiers; benchmark cold/warm preparation and phone cost; reuse caching only when its input/output contract matches.
- **W-20 — CI/staging/release gates.** Validate schema, pure resolver, historic saves, pose/fit/material tests, staged asset availability and rollback; deploy staging only when authorized; live manual and distribution rights-gated.

## Next integration milestone: W-07 coat fitting, then W-06 editable controls

The W-06 read-only inspector is now implemented on a review branch without changing live selections. First review its no-save/no-camera regressions and mobile layout. W-07 must obtain a non-retired, legal, rig-compatible coat candidate and check `top + corset + coat`, `gown + coat`, sleeve cuffs, collision/pose frames and open/closed coverage. Only then design W-06 phase 2 mode controls, versioned save actions and rollback. Do not replace old wardrobe deletion/equip logic until all legacy cases pass.

## Done means evidence, not words

A command is complete only with code or documentation diff, reviewable commit, explicit tests (with pass/fail/skip), measurements where applicable, dated concise decisions and remaining problems. Report partial completion accurately and leave later commands queued, not silently executed.
