# Wardrobe authoring pipeline

**Status:** Planned fit architecture v1.1; W-07 private FBX intake scanner and inspect-only candidates are implemented on a review branch. Body transfer, fitting, export and release are not implemented. See [RULES](RULES.md) and [TESTING](TESTING.md) for acceptance.

## Goal: prepare once, render cheaply

`private source -> intake inventory -> classification -> body/rig profile -> layer resolution -> controlled fit -> geometry/pose QA -> material and LOD QA -> Hero/NPC/rework review -> rights-gated staging/release`.

Prioritize **offline Blender/authoring fitting** and save fitted garage/mobile meshes. Avoid heavy mesh deformation on each outfit switch and especially every animation frame. Reuse current wardrobe fit cache where topology-preserving results match its documented key/output contract; do not cache arbitrary material changes under geometry-only keys.

## W-07 uploaded coat/jacket source intake (implemented; no fit approval)

The user provided **Coat 01**, **Jacket 01** and **Jacket 02**, each as `THICK`, `THIN UNWELD`, `THIN WELD` FBX, plus one 2048×2048 normal map, a source render, and a private CLO `.zprj` project. Stable non-conflicting candidate IDs and SHA-256s are in [outerwear-candidates.json](../../packages/wardrobe-catalog/outerwear-candidates.json); source bytes and derivative geometry are deliberately **not committed**. The existing retired catalog garment `coat-01` is unchanged.

Use the **THIN WELD** exports for the first import. They retain all authored polygon faces and UVs but have no extra unreferenced origin vertices. The THICK/UNWELD variants contain hundreds/thousands of **unreferenced** zero control points, not extra rendered pieces; do not confuse raw all-vertex bounds with referenced bounds. The three welded source triangle counts are 166,620 / 124,942 / 175,554, so none is a mobile-ready LOD. All nine FBXs are static/unskinned: no Deformer nodes. The W-07 inspector reads FBX 7700 using Python's standard library and checks the preferred file hashes without Blender.

From a private working directory with the uploaded files (Python 3.11+):

```powershell
py scripts/wardrobe/inspect_outerwear_assets.py --directory "C:\PrivateAssets\Outerwear" --expected packages/wardrobe-catalog/outerwear-candidates.json --json "C:\PrivateAssets\Outerwear\w07-intake-report.json"
```

Use `python` instead of `py` on systems without the Windows Python launcher. The generated report may be shared for review; do not upload the underlying commercial FBX, `.zprj`, or normal maps to GitHub, S3/public CDN or a public PR without independent rights verification. This metadata audit does **not** create, rig, fit or render a GLB; it only prepares reproducible source inventory.

**Next actual fitting:** obtain the installed `vesper-body.glb` (full donor), verify cm→m and Y-up conversion against bind-pose landmarks, transfer exactly 88 joint weights and preserve UV/material/rig IDs, then perform posed collision and open-front layer tests for Coat 01 over a thin top. Optimize separately for garage/mobile only after pose fit. Jacket 01 is second; close-fitting Jacket 02 is third. Do not assume a buttoned/open silhouette has a working animated closure. Only a verified GLB can enter the existing scanner, and fitted variants must remain gated on release rights.

## Proposed stages

1. **Intake:** scan installed GLB/FBX/BLEND files and texture archives privately. Record input path, SHA-256, asset family/source, revision, units, counts, rig/skin/joint and material metadata. Do not copy commercial archives into public Git.
2. **Classify:** infer garment class, occupied body regions, material submeshes and map roles. Keep confidence + manual override; below-threshold classification remains unclassified. Deduplicate identical images by hash and group maps by source material.
3. **Measure:** derive a `BodyFitProfile` from a complete character donor mesh, including canonical space, scale, bind pose, stable bone mapping, sampled torso/hip/limb cross-sections, shoe floor plane and pose-specific surface samples. Initial target: existing female Vesper donor with `BODY_WARDROBE`, then expand to male bodies.
4. **Describe:** load class defaults and explicit item relationships from a versioned, validated manifest. Store region-specific layer order, protected masks, under/over modes, dependency and unsupported-combination rules. Resolve without mutating saves.
5. **Fit:** rigid alignment first, then skin-weight transfer, then minimal local deformations under [moderate limits](RULES.md#5-geometry-policy-moderate--controlled). Protect UVs, folds, lace, eyelets, original rig and garment silhouette. Roll back an iteration that worsens topology/visibility or exceeds hard bounds.
6. **Validate:** sample pose and layer interactions, signed/visibility-aware contact, normal/tangent/UV continuity, self-intersections, foot/floor and mobile/garage geometry. Missing installed assets must be flagged; no skipped run may be reported as a pass.
7. **Materials:** identify baseColor (sRGB) and data maps (linear normal, ORM, alpha, AO) using actual metadata; do not guess channel packing from the file name alone. Use existing per-piece dye groups rather than generating a new conflicting appearance model.
8. **Shortlist:** rank combinations of actual garment fit + materials + measured performance, not texture images alone. Proposed score: visual 40%, geometry/animation 35%, mobile cost 15%, dye flexibility 10%. Hero candidate >=85; NPC 60–84; rework <60. Hard blockers override scores. These thresholds need calibration.
9. **Export:** prepare separate fitted `garage`/`mobile` GLBs with unchanged saved garment ID, source hash, fit-rule version, map references, a report and diagnostic images. Maintain original/fallback assets and allow explicit rollback.
10. **Approve/release:** reviewer selects Hero/NPC/rework; track independent technical `candidate -> fitted -> integrated -> mobile-tested -> approved` and rights `needs-evidence -> terms-reviewed -> distribution-cleared` states. Never auto-promote unreviewed assets to external/public distribution.

## Proposed private outputs per asset revision

`input-inventory.json`; `classification.json`; `body-profile.json`; `layer-resolution.json`; `fit-report.json`; `collision-report.json`; `texture-report.json`; `deformation-map.json`; front/back/side/motion previews; `fitted.garage.glb`; `fitted.mobile.glb`; `review-decision.json`. These are artifact **targets**, not existing files.

Each report SHOULD include: asset SHA-256, donor/rig hashes, fit-policy version, rule/mode overrides, geometry tier, pose names and sample times, software versions, classification confidence, detected defects, outcome, reproducibility command and reviewer/date when human-approved.

## Integration points, verified in current repository

- Existing discovery: `frontend/scripts/discover-wardrobe-garments.mts`; `npm run wardrobe:catalog` / `npm run wardrobe:catalog:check`. Scanner currently covers some garment categories but does **not** provide the new generalized compatibility resolver.
- Shared catalogs: `packages/wardrobe-catalog`. Keep historical IDs and retired definitions for old saves; do not replace hand-curated IDs with auto-generated aliases.
- Fitting: `frontend/src/game/characters/wardrobeBody.ts`, `gothicSkirtFit.ts`, `gothicCorsetTuck.ts`, `wardrobeDressFit.ts`, `wardrobeTopFit.ts`, `wardrobeGarmentFit.ts`.
- Appearance: `dressMaterials.ts`, `corsetDye.ts`, `clothingPieces.ts`.
- Cached fits: `wardrobeFitCache.ts` and `wardrobeFitCache.README.md`.

## Asset provenance and safety

Commercial source zips, blend masters, purchased texture maps, receipts and entitlement files stay in authorized private storage. A private bucket/password is not a license. The existing [asset clearance policy](../ASSET_CLEARANCE.md) applies, including browser-delivery permission and commercial restrictions. Store technical candidate status independently from legal status. The catalog can carry safe metadata, but never publish proprietary textures or models solely because they passed geometric tests.

## Ownership and documentation hygiene

- New machine-readable schema may be proposed under `packages/wardrobe-catalog` after validation; [RULES.md](RULES.md) remains its human-readable normative description until reviewed and versioned.
- Body/fit and classification scripts are proposed under `scripts/wardrobe/`; no implementation directories have been created by this documentation update.
- Avoid a second source of truth in UI, server or README. Link to shared schema and test fixtures.
- Release workflow stays staging-for-review, manual live decision. Keep original source assets and a revertible catalog manifest revision.
