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

## Explicitly unresolved

1. Precise rig/body measurements and unit-scale verification from full installed GLBs.
2. Which currently installed corset/coat and gown/coat pairs actually pass mobile and garage pose checks.
3. Initial class-specific soft/hard millimeter values, fabric stretch thresholds and actual phone budgets.
4. Whether to support multiple coats/tops in a single selection slot; v1 proposes one selected item per functional slot.
5. Backward-compatible serialized format for per-garment layer modes, with Rust validation and migration plan.
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
