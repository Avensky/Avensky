# Avensky wardrobe foundation

**Status:** Architecture specification, version 1.3, drafted 2026-11-25. Not yet implemented or validated as a complete pipeline.
**Scope:** Game wardrobe and reusable character/clothing authoring. Do not move private vehicle-research, soft-body solvers or licensed source archives into the public game repository.

This is the **single entry point** for human contributors and AI coding agents. Do not copy the same rules into component READMEs. Link to the source of truth below.

| Source of truth | Owns |
| --- | --- |
| [RULES.md](RULES.md) | Deterministic body-region layering, compatibility, fit modes, protection masks and proposed geometric tolerances |
| [PIPELINE.md](PIPELINE.md) | Intake, measurements, fitting, texture grading, output artifacts and release gates |
| [TESTING.md](TESTING.md) | Regression matrices, required fixtures, reporting and acceptance requirements |
| [DECISIONS.md](DECISIONS.md) | Dated decisions, verified baseline, assumptions, exceptions and remaining unknowns |
| [COMMAND_QUEUE.md](COMMAND_QUEUE.md) | Small, dependency-ordered prompts for future implementation sessions |

## W-03 machine-readable contract (not live integration)

See [layer-rules.json](../../packages/wardrobe-catalog/layer-rules.json), [JSON Schema](../../packages/wardrobe-catalog/layer-rules.schema.json), and [strict validator](../../packages/wardrobe-catalog/validate-layer-rules.mjs). Run `npm run wardrobe:layers:check`. Class rules remain proposed `needs-fitting` or `blocked`, not approved geometry; W-04/W-05 are available as pure resolver and optional reversible-save metadata on review branches. W-06 surfaces read-only diagnostics only; game-render integration remains gated.

## W-04 pure resolver candidate (not live)

[W-04 resolver](../../packages/wardrobe-catalog/resolve-wardrobe-layers.mjs) now plans class relationships and per-region ordering without touching saved selections or Three.js geometry. **W-05** must migrate legacy profiles before the game uses this resolver. The pure contract passed [26 focused tests](https://github.com/Avensky/Avensky/actions/runs/45743026433) on Node 24; these do not establish in-app geometry or device quality. Read [W-04 contract](RULES.md#7-w-04-resolver-behavior-and-evidence-contract) and run `npm run wardrobe:layers:check`.

## W-05 reversible save adapter (review-only)

[Migration adapter](../../packages/wardrobe-catalog/migrate-legacy-wardrobe.mjs), [sidecar schema](../../packages/wardrobe-catalog/wardrobe-layers-save.schema.json), and [shared fixture](../../frontend/tests/fixtures/wardrobe-layer-save-v1.json) preserve historical saved outfits while optionally recording garment mode intent. Rust can deserialize and validate this field on the W-05 review branch; legacy records without it remain unchanged. **No automatic conversion or live-render changes.** Read [normative save rules](RULES.md#8-w-05-versioned-saved-outfit-adapter-normative-contract) and [cross-language tests](TESTING.md#w-05-device-and-server-save-compatibility).

## W-06 read-only fitting-room layer preview (review-only)

[Preview projector](../../packages/wardrobe-catalog/wardrobe-layer-preview.mjs) and [inspector UI](../../frontend/src/game/characters/WardrobeLayerInspector.tsx) expose saved garment modes and provisional ordering behind an opt-in **Inspect outfit stack** control in the existing Layers tab. A small Outerwear tab is inspection-only until W-07 has a non-retired, reviewed coat. The feature does not equip, save, alter camera focus, hide meshes, or authenticate fitting evidence. [Focused CI](https://github.com/Avensky/Avensky/actions/runs/45762594236) verified 39 pure and 4 UI tests on the review branch; this does not prove real fit or phone rendering. See [W-06 rules](RULES.md#9-w-06-read-only-layer-inspector-contract) and [W-06 tests](TESTING.md#w-06-layer-inspector-acceptance).

## Automated fitting recipe design (not an implemented mesh solver)

[garment-fit-recipes.v1.json](../../packages/wardrobe-catalog/garment-fit-recipes.v1.json) is the machine-readable stage/guard contract for reproducible source alignment, constrained corset/top/coat fit, independent material swapping and pose QA. See the single [fitting pipeline owner](PIPELINE.md#w-07-automated-fitting-recipe-v1--design-contract-not-yet-a-working-fitter). Actual rig transfer/geometry fitting still requires the Vesper donor and W-14/W-15 measurement work.

## W-07 uploaded outerwear candidate intake (not fitted)

Three uploaded CLO outerwear designs have stable [candidate IDs/hashes](../../packages/wardrobe-catalog/outerwear-candidates.json), safe Outerwear inspection cards, and a [read-only Python asset inspector](../../scripts/wardrobe/inspect_outerwear_assets.py) requiring no Blender. The source FBX/project/texture files remain private. **No meshes are rigged, fitted, published or equippable.** Use the [canonical W-07 pipeline](PIPELINE.md#w-07-uploaded-coatjacket-source-intake-implemented-no-fit-approval) and [source QA rules](TESTING.md#w-07-private-outerwear-intake-acceptance).

## Current architecture; not the intended future behavior

- Shared catalog: `packages/wardrobe-catalog/`, including curated `character-garments.json` and generated `discovered-wardrobe-garments.json`.
- Runtime choices/replacements: `frontend/src/game/characters/wardrobeGarments.ts`; visible piece logic: `clothingPieces.ts`.
- Dressing-room categories: `frontend/src/game/characters/DressingRoom.tsx`.
- Existing fit utilities: `wardrobeBody.ts`, `wardrobeGarmentFit.ts`, `gothicSkirtFit.ts`, `gothicCorsetTuck.ts`, `wardrobeTopFit.ts`, `wardrobeDressFit.ts` and `wardrobeFitCache.ts`.
- Existing material behavior: `dressMaterials.ts`, `corsetDye.ts` and `shortSkirtFabric.ts`.

Current code often uses **replacement** semantics; the future system must distinguish **equipped**, **active** and **visible** without silently deleting saved underlayers. Do not represent this specification as an implemented feature.

## Working contract for implementation agents

1. Read this index and the relevant linked specification, then inspect code/tests at the current commit. Do not rely on historical chat summaries as current code.
2. Record the starting behavior, target invariant and known fixture availability in [DECISIONS.md](DECISIONS.md).
3. Work in a focused review branch. Keep original assets, user saves, authored colors and stable garment IDs unchanged unless an explicit migration is approved.
4. Implement the **smallest** vertical slice: pure resolver and manifest validation before UI, geometry or batch asset updates.
5. Test ordinary, conflict, migration and missing-asset cases. An asset-dependent skipped test is **not** a verified geometry pass.
6. Capture source hashes, changed files, measurements, before/after images when applicable, tests and unresolved cases; write a concise dated decision note.
7. Update only the owning specification when rules change. Elsewhere, leave a link, not duplicate prose. Deprecate obsolete logic deliberately with migration tests.
8. Never merge, release assets, or deploy live automatically. Technical fit, artist approval and legal/distribution clearance are separate gates.

Words: **MUST** = implementation invariant; **SHOULD** = default unless documented exception; **PROPOSED** = calibration required; **VERIFIED** = demonstrated by evidence at a pinned revision.

## High-level goal

Import GLB/FBX/Blender assets and texture collections privately; discover and classify; fit against measured character bodies; resolve garment-to-garment layering by region; test animations and textures; rank for Hero/NPC/rework; export preview/LOD artifacts; and publish only approved, rights-cleared selections. Dress, top, corset, skirt, pants, shoes and coat behavior must be consistent with their saved outfit IDs.

## Boundary and cross-links

For schema/catalog editing, use [wardrobe catalog README](../../packages/wardrobe-catalog/README.md). For existing in-game fitting and camera behavior, use [character README](../../frontend/src/game/characters/README.md). For commercial source files and distribution restrictions, use [asset clearance](../ASSET_CLEARANCE.md).

**No changes to runtime outfit semantics are authorized by merely merging these documentation files.**
