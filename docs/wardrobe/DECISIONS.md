# Wardrobe decisions, evidence and open issues

**Owner:** Dated concise decisions and checkpoints. Link to [RULES](RULES.md), [PIPELINE](PIPELINE.md), [TESTING](TESTING.md) rather than reprinting their normative sections.
**Documentation branch:** `docs/wardrobe-foundation-20261125`.
**Status:** Planning baseline, not an implementation certificate.

## 2026-11-25 — Agreed design direction

| Topic | Decision | Evidence status |
| --- | --- | --- |
| Deformation policy | **Moderate / controlled**, with region-specific soft and hard limits and protected submeshes | Agreed policy; numeric bounds proposed, not calibrated |
| Layering | Coats over tops/corsets/gowns; explicit modes for cuff, waist, belt and boot interactions | Proposed resolver; no new runtime changes made |
| Persisted clothing | Split `equipped` vs `active` vs `visible`; never silently delete saved underlayers | Required invariant; current code needs migration |
| Compatibility | Deterministic per-body-region ordering and explicit pair/mode constraints; unknown pairs need fitting | Proposed contract; new manifest not yet implemented |
| Fabric | Material-class-specific deformation resistance; score fit/material together, not just texture | Proposed; new classifier not implemented |
| Asset tiers | Candidate Hero >=85, NPC 60–84, rework <60 with hard quality and separate rights gates | Proposed initial calibration, not verified grading |
| Documentation | One canonical index plus Rules/Pipeline/Testing/Decisions/Command Queue; link instead of duplicate README prose | Documentation-only change in this branch |
| Release | Staging review separate from manual live publication; commercial sources remain private and rights-gated | Existing asset-clearance policy |

## 2026-11-25 — Agent onboarding and anti-repetition guardrail

- Updated the repository-level `AGENTS.md` to require wardrobe agents to read the canonical foundation before editing, identify the W-xx work item, preserve source assets and saved clothing IDs, run relevant geometry/visual/pose tests, and document each outcome in this log.
- The agent instructions are a **discovery and process gate**, not implementation of garment fitting or an enforcement mechanism for every possible external agent. Automated test gates remain part of W-15/W-20.
- This documentation change intentionally does not modify selection, rendering, appearance, or staging behavior.

## Verified current-code observations (not desired new semantics)

- `frontend/src/game/characters/wardrobeGarments.ts` defines `wardrobeGarmentReplacements`; its `setWardrobeGarment` currently deletes selected top/skirt when equipping a dress and deletes dress when selecting top/skirt.
- `frontend/src/game/characters/clothingPieces.ts` derives visible pieces using removal and replacement lists; `braFitsWith` is a legacy constraint.
- `frontend/src/game/characters/DressingRoom.tsx` has Underwear/Inner/Middle/Outer/Overwear visual group labels; it does not yet implement the proposed region resolver.
- `frontend/scripts/discover-wardrobe-garments.mts` supports compatible GLB discovery with rig checks for a set of known subfolders; it does not implement generalized pants/shoes layer compatibility.
- Existing fit modules already implement item-specific geometry corrections and bounded CPU fit caching. Preserve accepted results during migration.
- The catalog README previously referenced `docs/readiness/README.md`, not present at inspected GitHub path. Fix the link to canonical docs.
- This branch is documentation-only; no tests or asset-fitting runs are claimed.

## 2026-11-25 — W-03 layer manifest implementation (review branch)

- Branch: `feat/wardrobe-layer-manifest-w03` based on `docs/wardrobe-foundation-20261125`; `main` remains unchanged.
- Added `packages/wardrobe-catalog/layer-rules.json` with 20 garment classes, 47 provisional class relationships, two explicit dependency policies and no auto-approved item overrides. The draft rules include closed/open coats, corset direct/over-top/over-dress, tucked/over waistlines, belt placement, glove cuffs, scarf placement and boot cuff modes.
- Added parent/child dependency lifecycle policies, distinguishing derived petticoats from explicitly selected underlayers; only derived selections can be automatically removed when no valid parent remains.
- Added JSON Schema `layer-rules.schema.json`, standalone Node semantic validation `validate-layer-rules.mjs` and focused pure tests in `frontend/tests/wardrobe-layer-manifest.test.mjs`.
- Added `npm run wardrobe:layers:check` to run the validator/tests and wired it into `check:frontend`. A dedicated PR workflow runs the check with Node 24 and no LFS assets.
- **Important:** This provides a **class-level validation contract only**, not the W-04 resolver, saved-look migration, model fitting or per-asset approvals. No registered GLB is newly certified.
- **Validated:** GitHub Actions [W-03 manifest run](https://github.com/Avensky/Avensky/actions/runs/45742104030) on Node 24.22.3 reported **8 pass, 0 fail, 0 skipped** before the dependent-layer extension. Expanded [CI run](https://github.com/Avensky/Avensky/actions/runs/45742227024) on Node 24.22.3 reports **9 pass, 0 fail, 0 skipped** for `npm run wardrobe:layers:check`, including mode reversals, item override validation, conflict rejection, cycle detection and input immutability. No GLB geometry, visual appearance, save round trip or phone benchmark was run in this check.
- **Correction recorded:** initial CI failed due to camelCase `bodyFit` violating the canonical kebab-case ID convention. Commit `d497ab3ea2df276628fa29ed0aacc23598835976` renamed the mode consistently to `body-fit`; the follow-up run passed.
- Next: W-04 pure deterministic resolver with class-to-garment mapping, conflict/review output and explicit saved-selection preservation. W-05 must migrate historical saves before changing runtime equipment behavior.

## 2026-11-25 — W-04 pure resolver review implementation

- Branch: `feat/wardrobe-layer-resolver-w04` based on W-03's review branch, **not** on merged main.
- Created pure ESM layer resolver and catalog piece-to-class adapter. Inputs are normalized selection records, not legacy saved-look data; no existing live wardrobe functions changed.
- Mode-dependent region ordering, block/review status, dependency disposition, unverified visibility defaults and stale fit/visibility evidence rejection are implementation targets for this branch.
- No GLB fit, material appearance or mobile QA is claimed by these synthetic tests. Evidence must be sourced and reviewed before publication. W-05 still owns legacy-save migration.
- **CI verified:** [W-04 contract run](https://github.com/Avensky/Avensky/actions/runs/45743026433) on Node 24 reported **26 tests passed, 0 failed, 0 skipped**. Includes W-03 schema checks, region-order completeness, mode-specific three-layer outfits, exact-fit-evidence freshness, explicit/derived dependencies, item-override cycles, conflicting visibility evidence, catalog classification, and immutable input checks. These are synthetic unit tests, not GLB or mobile QA.

## 2026-11-25 — W-04 CI correction: region completeness

- First W-04 contract run on PR #92 reported **21 pass, 2 fail**. Both failures concerned evidence approval for top + corset + coat; no actual asset tests were involved.
- Cause: W-03 class relations left shared shoulder/hip regions unspecified, so the conservative W-04 resolver correctly returned `UNKNOWN_RELATION` even when all explicitly described regions had fit evidence.
- Correction: expanded the intended class pair rules to cover every shared region where the same class relation applies, including shoulder/hips, and added a manifest regression test for region completeness. Unmodeled class pairings still fail closed as `UNKNOWN_RELATION`.
- The corrected W-04 checks passed in [CI](https://github.com/Avensky/Avensky/actions/runs/45742931798) (**24/24**); two further fail-closed tests passed in the [final contract run](https://github.com/Avensky/Avensky/actions/runs/45743026433) (**26/26**).

## 2026-11-25 — W-04 review outcome and next task

- Implementation branch: `feat/wardrobe-layer-resolver-w04`; [draft PR #92](https://github.com/Avensky/Avensky/pull/92) targets W-03's review branch; neither layer feature nor its parent is merged to `main`.
- Pure ESM resolver is review-ready for normalized IDs/classes, default/item modes, region-specific order graphs, candidate fit statuses, explicit/derived dependency disposition, and visibility intents. Catalog mapping intentionally returns `null` for unsupported classes (e.g. ordinary hats) rather than guessing.
- An active/passed pure graph is **not** a verified rendered outfit. Approval evidence supplied to the resolver must be independently authenticated; user-visible fit, rig, materials, LOD, and distribution checks are outside W-04.
- Next: **W-05** must inventory serialized legacy selections and server/browser validation, design a reversible versioned adapter, and prove load/save round trips before activating the new resolver in wardrobe UI. Then W-06/W-07 may integrate actual coat fitting and safe occlusion.
- Required integration discipline: do not rewrite old outfit IDs; never treat provisional `needs-fitting` relations as approved, and never discard selections when blocked.

## 2026-11-25 — W-05 reversible outfit persistence (stacked review)

- **Baseline verified:** Browser device saves use `avenlab-saved-outfits-v1` and `avenlab-local-character-v1`. Rust `CharacterChoice` has `deny_unknown_fields`; profile outfit saves deserialize and validate before persisting `progression.character_outfits`, with existing `wardrobe.shirt` normalization and separate `is_equippable` restrictions.
- **Decision:** Add optional `wardrobeLayers` v1 **sidecar** on the same serialized `CharacterChoice`. Retain every old key and ID as the source of truth. Avoid auto-migration on read, mode guessing from historical `shirt`, and any implicit conversion of retired/unknown accessories.
- **Implementation branch:** `feat/wardrobe-legacy-save-w05`, [draft PR #94](https://github.com/Avensky/Avensky/pull/94) based on the W-04 review branch. New pure migration adapter, JSON Schema, shared old/new fixture, Rust optional field with shared-manifest validation, TypeScript type, server persistence test and browser storage regression are review-only.
- **Security / order:** Rust rejects wrong version, stale slot/ID, duplicate bindings, unsupported mode, contradictory corset waist and unknown entry fields. Explicit body-fit modes remain saved intent, not approved mesh fit. The new field is not emitted by live UI; upgrade server validation before client writes this metadata.
- **Validated so far:** [Initial Node contract](https://github.com/Avensky/Avensky/actions/runs/45756697855) showed **26 W-03/W-04 + 7 W-05 pure tests passed**, 0 failed/0 skipped. Rust and browser integration checks for the complete branch are pending; see the final CI links when available.
- **No live behavior changed:** `setWardrobeGarment`, `wornClothing`, `SavedOutfits` and Rust equip restrictions remain unchanged. Existing browser and server records are never rewritten en masse.
- **Next:** W-06 should use W-05 projections read-only, then add explicit mode editing and exposure diagnostics with validated actual coat assets; never connect the resolver before staged regression review.

## Explicitly unresolved

1. Precise rig/body measurements and unit-scale verification from full installed GLBs.
2. Which currently installed corset/coat and gown/coat pairs actually pass mobile and garage pose checks.
3. Initial class-specific soft/hard millimeter values, fabric stretch thresholds and actual phone budgets.
4. Whether to support multiple coats/tops in a single selection slot; v1 proposes one selected item per functional slot.
5. **Designed in W-05:** optional v1 layer-mode sidecar and reversible adapter. Remaining: full cross-language CI, rollout/server-first deployment and old-save migration/renderer integration reviews.
6. Presence/provenance and legal status of privately stored purchased texture/model collections.
7. How to represent dress+pants and dress+top exceptional combinations safely in catalog schema.

## Required process note after each implementation task

```text
Date / topic:
Baseline commit and asset hashes:
Confirmed observations:
Decision made and rejected alternatives:
Changed files / schema migrations:
Commands run + test pass/fail/skip:
Measurements / reference screenshots:
Known defects and exception IDs:
Documentation owner updated (link):
Next command and blocker:
```

If older guidance conflicts with new behavior, mark the old advice **superseded**, link to the owning spec and add a test covering the migration; never leave competing instructions. Keep existing root/component READMEs as short navigation points. Avoid repeated "history" paragraphs in multiple locations.
