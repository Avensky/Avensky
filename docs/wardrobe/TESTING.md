# Wardrobe testing and verification

**Status:** Acceptance and evidence specification; pure W-03/W-04/W-05 tests are implemented, while garment/phone verification remains planned. Never claim a proposed threshold has passed without actual fixture evidence.

## W-03: shared manifest structure and conditional graph checks

The `layer-rules.json` manifest is validated without installing character GLBs or npm packages. From the repository root, run `npm run wardrobe:layers:check`. This executes the strict structural/semantic validator and `frontend/tests/wardrobe-layer-manifest.test.mjs`. This also validates derived-vs-explicit dependent underlayer lifecycles (e.g., skirt/petticoat). The [verified 2026-11-25 CI run](https://github.com/Avensky/Avensky/actions/runs/45742227024) completed with **9 passed, 0 failed, 0 skipped** using Node 24.22.3. The independent CI workflow `.github/workflows/wardrobe-layer-rules.yml` runs the same command for relevant pull requests. Validation covers class IDs, known body regions, exclusive mode values, item override shapes, mutually exclusive conditionals, contradictory pair rules and satisfiable ordering cycles. A valid manifest does **not** mean the fitted garment or its materials pass.

## W-04 pure resolver acceptance

Run `npm run wardrobe:layers:check` to validate the manifest and run both `wardrobe-layer-manifest.test.mjs` and `wardrobe-layer-resolver.test.mjs` on Node 24. This tests deterministic ordering, three-layer outfits, mode-specific waist/belt/boot reversals, invalid and unknown relationships, protected saved IDs, class mapping by actual `piece`, dependent layers, and fit/visibility evidence that must match the exact body/tier/pose/outfit as applicable. These **pure checks use test-only synthetic assets** and do not claim that an actual fitted garment has been visually verified. W-05 old-save round trips are implemented and tested; W-07/W-15/W-13 require real posed GLBs and on-device evidence before approval.

W-04 evidence: [2026-11-25 Node 24 contract run](https://github.com/Avensky/Avensky/actions/runs/45743026433) completed with **26 passed, 0 failed, 0 skipped** (manifest + pure resolver). Tests require no source GLB models and are **not** a garment geometry, rendering, saved-profile persistence, physical device, or asset-license approval. Full Cloud asset streaming/build CI is separate and should not be inferred from this green contract run.

## W-05 device and server save compatibility

The single [cross-language fixture](../../frontend/tests/fixtures/wardrobe-layer-save-v1.json) contains an old historical choice and the same choice with an optional `wardrobeLayers` v1 sidecar. It covers a legacy Gothic corset set, trial corset, item dyes, separately selected top/skirt/petticoat/bow/socks, saved removals and the new `over-top` intent.

**Check commands** (from repo root):

```sh
npm run wardrobe:layers:check
npm run wardrobe:legacy:check
cargo test --locked --manifest-path avenlab-server/Cargo.toml layered_wardrobe_
(cd frontend && node --test tests/wardrobe-layer-save-ui.test.mjs)
```

The final browser-storage command requires `npm --prefix frontend ci` first, and Vite MUST run with `frontend` as the working directory. Dedicated [CI workflow](../../.github/workflows/wardrobe-legacy-save.yml) checks the Node adapter, browser storage via Vite/JSDOM, and Rust saved-character/profile persistence. The old profile payload is tested independently, not simply by stripping a field from the same object.

**Safety acceptance:** read old localStorage unmodified; explicit opt-in conversion preserves all original keys and dyes; revert drops only sidecar; duplicate/stale IDs or unknown modes are rejected; existing outfit-save endpoint persists both legacy and layered profiles; neither format bypasses old equipment restrictions; no GLB collision, real coat, or mobile claims from these contract tests. Rust's historical normalization of obsolete `shirt` codes is a pre-existing documented behavior.

**Verified W-05 CI:** [Run 45757119689](https://github.com/Avensky/Avensky/actions/runs/45757119689) passed all three jobs: Node 7/7, Rust 3/3, actual browser storage 1/1, with no test failures/skips. These do not prove garment geometry, actual coat fitting, deployment compatibility with an old server, or mobile rendering. See [DECISIONS.md](DECISIONS.md) for the initial Vite test-runner path failure and corrective change. Distinguish unit contracts, on-disk persistence and game-render acceptance.

## Test layers and failure classification

1. **Pure schema/resolver:** deterministic outputs, stable identities, explicit conflict reasons, no mutation, consistent body-region graph, cycle detection, unsupported mode and unknown item behavior.
2. **Legacy regression:** old saves, retired garment IDs, special Gothic waist/corset modes, bra-after-top-removal, skirt/petticoat dependencies, color/dye persistence and outfit selection semantics.
3. **Geometry:** signed penetrations, exposed surface coverage, self-contact, extreme deformation, edge/UV continuity, protected details, rig/skin weights and floor contact.
4. **Motion:** idle/A pose, walk, run/turn, arms up, crossed arms, reach, sit/drive, clutch/brake/gas, twist, selected emotes. Sample across animation phases, not only endpoints.
5. **Render/material:** front/back/side, exposed underlayers when open, opaque coverage when closed, transparency, shadows and mobile/garage LOD parity.
6. **Performance and rights:** outfit cold/warm prepare time, texture budget, phone GPU/frame time and evidence that distribution is approved independently.

## Mandatory compatibility scenarios

| Scenario | Expected invariant |
| --- | --- |
| Shirt + corset + coat | All IDs preserved; requires fit evidence; coat outermost torso/sleeve, corset over shirt |
| Coat open -> closed -> open | Same shirt/corset, colors and saved data; visibility switches only |
| Remove coat | Underlayers reappear without refit or data loss when a cached valid fit exists |
| Gown + short coat | Gown remains outermost below coat hem; sleeves/collar clear coat |
| Tunic + trousers | Explicit over-pants profile; no automatic clearing of pants |
| Full gown + trousers, no profile | Block or request review; do not silently discard either |
| Corset tucked vs over skirt | Invert only waist relation; check each separately |
| Top sleeve + coat sleeve | No raised-arm/cuff collisions and no uncovered black gaps |
| Belt under vs over coat | Distinct approved modes; don't cinch wrong host |
| Glove under vs over cuff | Exclusive regional mode and motion clearance |
| Pants tucked into boots | Boot shaft outside pants at ankle; maintain left/right and pedal/floor contact |
| Pants outside boots | Wide cuff outside shaft; slim pants/bulky boots fail without fitted profile |
| Stockings + socks + shoes | Preserve three IDs, foot pose and sole placement |
| Open/transparent/split garments | Coverage doesn't incorrectly hide visible body or underlayers |
| Missing GLB/incorrect rig | Explicit blocked/review result, no false pass |
| Same outfit in different selection order | Same resolved regions, statuses and reason codes |
| Saved legacy outfit -> load -> save | IDs/dyes untouched unless explicit versioned migration |

## Proposed numeric QA thresholds

Refer to [RULES.md](RULES.md#5-geometry-policy-moderate--controlled) for movement and desired clearances. Initial candidates:
- Strict visible seam/skin edge: **>1 mm** exterior exposure fails, preserving existing stricter skirt regression semantics.
- Isolated other visible exposure up to **2 mm**: reviewer-required, **not** automatic Hero pass.
- Persistent visible **>2 mm**: failed fit; any visible **>5 mm**, inverted triangles, broken rig or irreparable split: critical.
- Planted foot sole contact target **0–2 mm** from reference floor, subject to actual foot rig/physics validation.
- No blanket minimum body separation for loose gown drapes; compare intended cloth layer surfaces and exposure.
- Protected detail shapes and local stretch limits defined in RULES.

Thresholds apply only after unit normalization. Existing authored deformations can be grandfathered as **documented versioned exceptions**; do not change reference fixtures without review.

## Existing executable commands (when dependencies and GLBs installed)

From repo root:

```sh
npm run wardrobe:catalog:check
npm --prefix frontend run typecheck
cd frontend
AVENLAB_WARDROBE_REQUIRE_ASSETS=1 node --test \
  tests/tucked-skirt-pairings.test.mjs \
  tests/tucked-skirt-outfits.test.mjs \
  tests/wardrobe-hand-clearance.test.mjs \
  tests/gothic-skirt-layers.test.mjs \
  tests/top03-armhole.test.mjs \
  tests/top05-fit.test.mjs \
  tests/wardrobe-fit-cache.test.mjs
```

For PowerShell, set `$env:AVENLAB_WARDROBE_REQUIRE_ASSETS='1'` before calling `node --test`. If any path is renamed at implementation time, update these example commands against the actual test tree. Run additional wardrobe, dressing room, discovery, coverage and save regression suites.

Do **not** treat exit code zero with skipped asset-dependent tests as a geometry success. Record passed/failed/skipped counts, fixture hashes, machine, software version and timing.

## Pilot acceptance (first vertical slice)

1. Capture baseline for Vesper + Gothic Skirt 02 + Laced Bodice, both tucked/over, mobile/garage, with input/source hashes.
2. Verify pure resolver keeps shirt/corset/coat IDs without changing legacy behavior before activation.
3. Check waistband/underbust visibility, waist continuity, protected laces, material preservation and no increased self-intersections.
4. Exercise idle, full walking cycle, selected arms-up and seated pose phases. Report max penetration, affected triangles and visibility.
5. Verify original GLBs untouched; compare screenshots and signed numeric contact against baseline; document warnings.
6. Require human review before marking any new layered combination Hero/NPC approved.

## Reporting template

`testId; commitSha; sourceSha256; bodyProfileId; garmentIds; modes; tier; pose/phase; measuredRegion; maxVisiblePenetrationMm; exposedTriangles; maxVertexShiftMm; localStretchPct; notes; status; skippedReason`.

Automation must return descriptive reason codes and diagnostics, not arbitrary auto-fixes. Screenshot-only pass is insufficient; numeric-only pass without in-app material/skin check is also insufficient.
