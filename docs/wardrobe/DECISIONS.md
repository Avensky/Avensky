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
- **Verified:** [Node contract](https://github.com/Avensky/Avensky/actions/runs/45756697855) passed **26 W-03/W-04 + 7 W-05 pure tests**, 0 failures/skips. [Rust W-05 persistence](https://github.com/Avensky/Avensky/actions/runs/45756823729) passed **3/3 targeted tests**, including actual profile save/reload and strict invalid-entry rejection. [Deployment environment isolation](https://github.com/Avensky/Avensky/actions/runs/45756951908) passed on W-05 code. Browser-storage CI initially failed due to Vite's launch directory; the corrected [W-05 verification run](https://github.com/Avensky/Avensky/actions/runs/45757119689) completed with **all three jobs green**: Node **7/7**, Rust **3/3**, and actual browser storage via Vite/JSDOM **1/1**; no failed or skipped targeted tests.
- **No live behavior changed:** `setWardrobeGarment`, `wornClothing`, `SavedOutfits` and Rust equip restrictions remain unchanged. Existing browser and server records are never rewritten en masse.
- **Next:** W-06 should use W-05 projections read-only, then add explicit mode editing and exposure diagnostics with validated actual coat assets; never connect the resolver before staged regression review.

## 2026-11-25 — W-05 browser test runner correction

- The initial browser-storage CI failed before loading saved data because Vite was launched with the repository root, so `/src/game/characters/localOutfits.ts` did not resolve. This is a **test runner path/configuration issue**, not a measured save-format defect.
- Corrected the GitHub Actions browser job to use `working-directory: frontend` and updated the documented verification command. Rust and pure Node save contract tests passed separately.
- Browser rerun **passed 1/1, with 0 failed and 0 skipped**, running from `frontend`. Node and Rust jobs in the same [run](https://github.com/Avensky/Avensky/actions/runs/45757119689) also passed. The Vite warning about multiple Three.js instances did not fail this test; it is not evidence of wardrobe rendering correctness.

## 2026-11-25 — W-06 inspection-only layering UI (stacked review)

- **Baseline:** W-05 review branch `feat/wardrobe-legacy-save-w05` at `124600c`. W-03/04/05 are still separate draft PRs targeting predecessor branches, not merged to `main`.
- **Confirmed:** `DressingRoom.tsx` already has Layers and a horizontal, mobile-friendly left catalog rail. `coat-01` is currently **retired** in the catalog, so there is no approved coat to equip. Opening Layers presently focuses Full body; the new inspector toggle itself must not change the shot.
- **Decision:** Use a pure read-only projection of the W-05 save format and W-04 region graph, rather than changing `setWardrobeGarment`, `characterLook`, saved storage, or the character scene. Any unknown source/class remains in the saved-selection list. Explicit retired and old suspended entries are not silently discarded.
- **Changed files:** `wardrobe-layer-preview.mjs` and type declarations, `WardrobeLayerInspector.tsx` and landscape CSS, a Layers toggle and inspection-only Outerwear category, pure preview tests and real Vite/JSDOM fitting-room tests, CI workflow, and canonical docs. [Draft PR #97](https://github.com/Avensky/Avensky/pull/97).
- **Contract verification:** Initial W-06 pure projection checks failed **1 of 6** because W-04's no-conflict single-node `allowed` was carried into the viewer as a purported fit approval. Fixed the viewer to always label such evidence-free items `unverified`; [Node contract run](https://github.com/Avensky/Avensky/actions/runs/45761927564) now passes **6/6 W-06 tests**, 0 failed, 0 skipped (alongside earlier W-03/04/05 tests). TypeScript and the full React/Vite integration check are tracked in the dedicated PR workflow; no visual/pose claims.
- **Lint baseline:** [First W-06 workflow](https://github.com/Avensky/Avensky/actions/runs/45761772808) passed TypeScript but full frontend ESLint failed with **75 existing unrelated issues** (69 errors and 6 warnings, e.g. combat rendering purity rules); no W-06 file was identified in the failure report. Changed the PR CI to lint the two edited React components without hiding this global baseline. A separate project-wide lint cleanup is still required. No screenshots, physical devices, GLB fit or FPS measurements have been claimed.
- **Known limitations:** base outfits remain legacy bundles (not individually classified); the W-04 planner has no authenticated fit report in this UI; a proposed `body-fit: over-top` does NOT make today's renderer draw that top/corset combination. W-07 must provide reviewed coat asset evidence before any equip action.
- **Next:** Review W-06 no-mutation and mobile layout tests, then W-07 actual coat fitting and W-06 phase 2 explicit mode editor with staging and rollback tests. Do not merge to main or deploy automatically.

## 2026-11-25 — W-06 final focused CI verification (draft PR #97)

- **Verified code revision:** `b0beb06` on `feat/wardrobe-layer-inspector-w06`. [W-06 GitHub Actions](https://github.com/Avensky/Avensky/actions/runs/45762594236) passed both jobs: **39/39 pure Node tests** (26 manifest/resolver, 7 legacy migration, 6 read-only layer projection) and **4/4 React/Vite/JSDOM UI tests** (3 historical dressing-room tests and 1 focused W-06 inspector test); **zero failures/skips**. Frontend TypeScript typecheck and ESLint on the two modified React components passed.
- **Regression corrections:** W-04's singleton `allowed` graph status no longer appears as a verified fit in W-06. Two old dressing-room test expectations incorrectly assumed entering or leaving the dressing room resets the camera; the assertions now enforce preservation of the current camera and zoom. No camera implementation was changed.
- **Additional safety coverage:** Test-only newly discovered, **unreviewed coat** card is present in Outerwear. Clicking it cannot equip, store or alter the outfit, and does not move the Face camera or zoom. No unreviewed coat can clear an existing garment, and the real `coat-01` remains retired.
- **Independent limitations:** full repository ESLint still has 75 unrelated existing issues (69 errors, 6 warnings), so only focused lint is green. These CI checks use synthetic coats/DOM and **do not measure** GLB clipping, pose contact, mobile FPS, actual device layout, visual appearance or commercial asset permissions.
- **Disposition:** W-06 phase 1 is implemented and CI-verified, **awaiting human review** on [draft PR #97](https://github.com/Avensky/Avensky/pull/97), stacked above W-05. No merge to `main`, staging deploy or production deploy performed. W-07 fitted coat/rig/pose review comes next, then W-06 phase 2 writable controls only with migration and rollback tests.

## 2026-11-25 — W-07 three uploaded CLO outerwear sources (intake only)

- **Baseline:** W-06 review branch `feat/wardrobe-layer-inspector-w06`, draft [PR #97](https://github.com/Avensky/Avensky/pull/97), verified 39 pure + 4 UI tests. New stacked W-07 branch `feat/wardrobe-outerwear-intake-w07`; no merge or deployment.
- **Provided locally:** 9 binary FBX v7700 files: Coat 01, Jacket 01, Jacket 02 × THICK / THIN UNWELD / THIN WELD; 3 render PNGs, 3 normal-atlas PNGs (2048×2048 RGBA), and 3 private `.zprj` CLO ZIP projects. These 18 assets have not been copied into the repository or public CDN. No independent redistribution/license evidence was included.
- **Actual geometry inventory:** all nine meshes have **zero deformers** and only one Geometry node. The preferred THIN WELD meshes have **Coat 01 86,118 control points / 166,620 triangles / 3 materials**, **Jacket 01 66,867 / 124,942 / 12**, and **Jacket 02 90,462 / 175,554 / 4**. All preserve UVs and mesh material assignments. Welded measured referenced extents (width × vertical × depth) are Coat `0.925×0.675×0.306 m`, Jacket 01 `1.061×0.528×0.307 m`, Jacket 02 `1.096×0.703×0.362 m`. These are **source-space measurements** using cm→m only; not verified actor-scale/body fits.
- **Important export finding:** THICK and THIN UNWELD contain 796–3,584 unreferenced zero control points that expand naive raw bounding-box calculations to ground origin. THIN WELD has no such unreferenced origin vertices and is the preferred source for Blender/rig alignment. This is **not extra visible geometry**; ignore unreferenced data when measuring.
- **Stable IDs:** new `clo-coat-01`, `clo-jacket-01`, `clo-jacket-02` in [private candidate metadata](../../packages/wardrobe-catalog/outerwear-candidates.json). Existing retired `coat-01` remains unchanged. Only inspect-only Outerwear cards are allowed; no equip/swap, GLB registration, saved-look migration or clipping clearance.
- **Source intake tool:** `scripts/wardrobe/inspect_outerwear_assets.py` is read-only, Python 3.11 stdlib, hashing source files and measuring referenced geometry to avoid reliance on missing `blender` shell commands. Re-run with `--expected` before processing new uploads. [Pipeline](PIPELINE.md#w-07-uploaded-coatjacket-source-intake-implemented-no-fit-approval) and [Testing](TESTING.md#w-07-private-outerwear-intake-acceptance) own commands/rules; do not duplicate them in individual READMEs.
- **Unresolved:** Vesper donor GLB not present in these uploads, 88-joint skinning absent, target scale/alignment not checked; normal maps alone do not provide full material texture sets; actual layered fit/pose/mobile geometry not tested; raw source licensing remains unverified. No fitted GLB is generated or published in this task.
- **Priority:** Coat 01 open over thin top first; cropped Jacket 01 second; narrow-waisted blazer Jacket 02 third. Then top+corset+coat and gown+coat via explicit body-region contact evidence; no automatic open/closed reshaping.

## 2026-11-25 — W-07 follow-up: reusable fit recipes and material independence

- **User-confirmed priority:** source clothing pack produced attractive tops; the biggest prior bottlenecks were corset warping and garment-specific geometry corrections, while fabric appearance should be swappable later. These uploaded coat/jacket models are **good candidates for fitting research**, not accepted layered outfits.
- **Assessment:** Coat 01 is first because open front and looser cut expose the layering issue without constricting waist; cropped Jacket 01 next for top/corset and skirt interface; tailored Jacket 02 later due to snug waist, lapels and sleeve seams. Source renders display fit to a source mannequin, not evidence of fitting Vesper or combining with our tops/corsets. Normal atlases are detail maps; no full material preset/color approval is implied.
- **Added reusable proposed contract:** [`garment-fit-recipes.v1.json`](../../packages/wardrobe-catalog/garment-fit-recipes.v1.json), [pipeline algorithm](PIPELINE.md#w-07-automated-fitting-recipe-v1--design-contract-not-yet-a-working-fitter), and [Node tests](../../frontend/tests/wardrobe-fit-recipes.test.mjs). This defines source/donor/pose requirements; regional skin-weight transfer; constrained structure versus soft cloth; specific corset anchoring and protected cups/eyelets; composite underlayer fit; rollback, pose/visibility gates, material variant separation and hashed cache dependencies. **No implementation claims:** the generic solver, rig transfer and actual fitting are not built or run in this change.
- **Correctness rule:** only material color, roughness, normal map, metallic and dye parameters are non-geometric. A true cloth-thickness change, underlayer change, source topology change, bind rig change, or closure geometry change **requires** fit invalidation and new measurements.
- **Next executable engineering action:** obtain a usable real `vesper-body.glb` plus actor bind/pose references in a private fitting workspace; implement an automated rig+landmark **dry-run** reporting exact mismatch and missing assets before moving vertices. Then fit Coat 01 over one thin top, inspect side/arm/pocket/cuff evidence, and refine the regional solver with Vesper data. Retain source-license and public-asset gates.

## Explicitly unresolved

1. Precise rig/body measurements and unit-scale verification from full installed GLBs.
2. Which currently installed corset/coat and gown/coat pairs actually pass mobile and garage pose checks.
3. Initial class-specific soft/hard millimeter values, fabric stretch thresholds and actual phone budgets.
4. Whether to support multiple coats/tops in a single selection slot; v1 proposes one selected item per functional slot.
5. **W-05 tested on the review branch:** optional v1 layer-mode sidecar, reversible adapter, Node/Rust/browser round trips. Remaining: human review, server-first deployment planning, and W-06 in-game migration/renderer integration; no live rollout occurred.
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
