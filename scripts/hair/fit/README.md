# Universal Hairstyle Fitting — Avensky V2 (design and acceptance spec)

**Project scope:** Vesper / original female character hair ONLY. Male hair, male clothing and other characters are **paused indefinitely**. No time pressure or parallel male work.

**Status (2026-11-25):** original Face4 skull and original `T_Villager_Lady_Face_BaseColor.tga` texture have been identified and visualized on the actual head. The original texture ALREADY includes a soft scalp/hair-root discoloration. **Preserve that original texture on Vesper; don't generate a substitute sphere, hard brown cap, or new scalp mesh by default.** V2 inspectors and optional diagnostic extraction are written, but actual Curly Mane root fitting, Blender QA and shippable GLBs remain unimplemented/unverified.

**Start by reading:** [FEMALE_HAIR_PROGRESS_AND_LESSONS.md](FEMALE_HAIR_PROGRESS_AND_LESSONS.md) → [AUTOMATION_READINESS.md](AUTOMATION_READINESS.md) → [ORIGINAL_SOURCE_AUDIT.md](ORIGINAL_SOURCE_AUDIT.md) → [QUICKSTART.md](QUICKSTART.md).

## Vesper FIRST: original head + original scalp texture

The original `SK_Village_Lady_Face4.fbx` includes the entire top/back of the skull (6,330 vertices / 8,915 triangles), while the original `T_Villager_Lady_Face_BaseColor.tga` supplies **actual skin tone and natural speckled gray-brown short-hair/root transition**. `SK_Village_Lady_Hair20.fbx` is a separate hair/braid mesh. The face ID and body ID masks are **not** the Face BaseColor.

1. Import Face4 and map the original Face BaseColor to its actual UVs in a neutral rigged PRIVATE Blender scene. Record bone, model scale, texture hashes and fixed front/right/back/left/top/3/4 views.
2. Preserve the visible original scalp markings. **Only if a style still exposes unintended coverage gaps** author a localized root material layer, wisps or under-clumps on a working copy. Never replace the original head with a debug cap as the routine first step.
3. Import one original donor geometry/UV/atlas set, starting with Curly Mane. Match coarse landmarks and fit the *roots only* to Face4; protect curl bodies and tips.
4. Run six-view, pose, material, phone and performance review; only then make a batch pipeline / GLB LOD releases.

The existing `extract_source_scalp.py` creates a **plain-color debug extraction from real Face4 triangles**, not a reproduction of the original textured scalp. It is optional and **not the default path**. `build_scalp_cap.py` and `cap_geometry.py` are synthetic fallback tools solely for characters without a complete skull. Never use them as Vesper's ordinary baseline.

## Why V1 did not solve the gaps
The existing `scripts/hair/blender_apply_batch.py` explicitly preserves the twelve fitted meshes' vertex positions, topology, skin, UVs and shape keys. It improves the material only. The donor texture archive contains three *separate* FBX meshes (`CURLY 01.FBX`, `CURLY 02.FBX`, `CURLY 03.FBX`) with their own geometry/UVs; the V1 material donor workflow does not fit those geometry meshes to Vesper. See `docs/assets/CURLY_SET_AUDIT.md`.

**Principle:** Do not mistake an alpha texture, an optional supplemental shell, or duplicated flat cards for actual hair density. **Face4 already supplies the skull and a naturally colored root foundation.** The original donor clumps/cards must supply the real hairstyle volume and silhouette; any extra interior clumps need approval and QA.

## Supported inputs / output contract
- Inputs: character reference **in neutral pose**, evaluated head mesh, armature/head bone, explicit head coordinate frame + five or more author-placed landmark empties, source FBX/GLB/BLEND + vendor textures, license metadata, a per-style profile.
- Supported geometry: polygonal meshes/cards/clumps; optionally convert Blender curves to duplicate meshes on a **working copy**. UVs/materials must survive.
- Style-specific annotation: source hairline/roots, part direction, ears/temple/nape bounds, optional bonnet/hat clearance and protected tips. No arbitrary guesswork for roots when source information is ambiguous.
- Output: non-destructive fitted .blend, hair+cap+optional cover meshes, export .glb per LOD, JSON receipt with input hashes, transform, fit metrics, material/rig checks and QA images; no copied paid sources in public Git.
- Never change the character's accepted head, rig, animations or scalp mesh. Derived cap is a *separate* object. Output paths are always distinct from input paths.

## Algorithm and stages

### 0 — Inventory (dry run)
Validate source existence, file type, units, axis directions, mesh count, material/texture paths, UVs, bound dimensions, topology/alpha, object hierarchy, armature info, license and candidate roots. Record SHA256 of source and report errors before changes. Freeze character landmarks in **head-local meters**, not world coordinates; locate the target head/armature in the actual GLB rather than assuming node names. Require manual confirmation of units when FBX scales are ambiguous.

### 1 — Canonical target landmarks
Character profile must contain explicit names and normalized, consistently ordered coordinates for forehead hairline center, crown, left/right temple, left/right ear anchors, and nape. Measure scalp shape from the **evaluated** head mesh in its neutral bind pose. Exclude face, ears, eyelids and neck; use a tagged scalp-face selection/vertex group authored once per character instead of a spherical clip. Place target head frame at its rig head-bone pivot. Cache head-to-world and inverse matrices and never apply transforms to source.

### 2 — Preserve source Face4 scalp first; supplement only if needed
Use the untouched original Face4 mesh and original Face BaseColor as the base. Inspect actual root coloring and any intentional visible part lines. **Do not create a second cap automatically.** If a real uncovered region remains, work non-destructively: a local root-pigment/wisp layer or optional Face4-selected extraction with original UVs and verified material. Exclude face, forehead skin, ears and eyes. A new mesh must not double-cover the original head, Z-fight or obscure the natural scalp transition.

### 3 — Align the hairstyle (coarse)
Normalize units and orientation *without destructive source edits*. Fit translation + rigid rotation + **uniform** scale using 3+ corresponding source-target landmarks. Compute a Kabsch / Umeyama similarity solution and reject reflections, nonfinite values and high landmark residual. Do not use independent XYZ scaling of curled clumps as a first fix. Show transformed vs original overlays for review. If source landmarks are absent, pause for author annotation rather than guess.

### 4 — Root-only conform (fine)
Work on a duplicate and keep pristine source. Assign each source strand/card/clump a manually or algorithmically confirmed root region; a custom `RootWeight` vertex group controls deformation (weight ~1 at roots tapering smoothly to 0 along first ~10–25% of length, adjustable). Project root vertices toward nearby target cap surface along head-local directions, constrained by target scalp normals and a stand-off offset; use BVH closest-point queries for candidates and reject distant, flipped, opposite-side matches. Smooth displacements along connected strands/curves; interpolate motion to nearby vertices by weights. Tips and mid-length curl structure stay put. **Never shrinkwrap whole hairstyles** (that destroys curls and silhouette). Measure max/median root-to-cap distances, deformation and silhouette change.

### 5 — Density / gaps / hairline
Do **not** auto-generate duplicate flat sheets globally. Render scalp and source hair with fixed exposure from FRONT, BACK, LEFT, RIGHT, TOP and 3/4 under opaque + cutout debug passes. Inspect exposed cap areas (occlusion masks) and classify expected parts vs true bald holes. Where missing bulk persists, add a small number of explicitly authored under-clumps/low-detail shell patches *inside* the outer style, assigned the same root direction. Do not cover legitimate part lines. Root wisps mask a hard cap/hair boundary.

### 6 — Rigging, physics and accessories
Attach scalp cap and fitted hair to matching head bone (or transfer vertex weights only for long/deformable hair that requires them). Preserve source skinned weights if compatible; never bind to a guessed bone index. Test head rotations, glance-down, driving idle, ponytail motion, collar collisions, top/bottom of bonnet, hats/hoods. Hair accessory behavior is **style metadata**: bonnet may auto-equip only with that style, and unequips when changing style. Preserve original geometry variants for show/compress/hide headwear modes; do not destructively cut the hair.

### 7 — Materials
Retain donor UV mapping and the matching donor atlas. Avoid mapping a Curly opacity map to unrelated Straight cards. Prefer alpha MASK/cutout for stable mobile rendering, carefully test halos and double-sided cost; verify tangents, normals, roughness and dark roots in Avensky lighting. Expose base/roots/highlights/tips only if per-style masks actually support independent control.

### 8 — Performance LOD / export
Create separate hero-garage (LOD0), game-mobile (LOD1), distant/silhouette (LOD2) working copies. Simplify clumps and remove hidden faces/cards by authored regions; don't decimate highly transparent cards blindly. Re-bake atlas where necessary. Measure **rendered triangles, draw calls, alpha overdraw, GPU frame cost, texture bytes and head-bone animation** on target device; source mesh face count alone is insufficient. Export GLBs with explicit materials, named hierarchy, head attachments and manifests; reimport and test in the actual runtime. Do not assert any target triangle budget without device measurements.

### 9 — Automated QA and explicit visual sign-off
Hard checks: finite transforms, original SHA unchanged, nonempty UVs, valid material images, glTF readable, no zero-area faces introduced, unique IDs, source mesh retained, no large root residuals/penetration, valid rig parent/head bone, expected number of exports. Geometry thresholds (millimeters) must be converted via documented scene units and tuned per character. Soft checks: hairline edge, bald spots, cap helmet appearance, curls not squashed, front/back/top silhouette, alpha halos, ears/collars, animated head, mobile GPU and licensing. A passing automated structural test **does not** confer aesthetic approval.

Report stages as PASS/WARN/FAIL/SKIPPED and block publishing if an unresolved FAIL remains. Include per-view screenshots for a human checkpoint.

## Pilot: CURLY 01 / Curly Mane
Known from `docs/assets/CURLY_SET_AUDIT.md`: `CURLY 01.FBX` (FBX mesh name `Curly_Mane`) has 42,685 source vertices, ~55,836 triangulated faces, source bounds approximately x[-17.06,16.65], y[-14.79,16.11], z[148.73,191.28] **in unverified FBX units**. This is not yet a fitted Vesper GLB. The Curls atlas is 2048x2048; keep these textures and the source mesh private until licensing verified.

1. Import Vesper's neutral head/rig and original Curly Mane into a private new Blender working scene; set head bone and scalp-face group once.
2. Mark source forehead/crown/temples/nape root landmarks and corresponding head-local target landmarks.
3. Inspect similarity transform preview; manually correct root anchors if confidence is low.
4. Keep the real Face4 scalp and its color; conform Curly Mane root strips toward it in measured passes, never using full-style shrinkwrap. Make supplemental coverage only where the actual hair needs it.
5. Evaluate front/back/side/top plus head turns and high-collar/bonnet poses.
6. Only after one approved original-looking fit, generate LOD1/LOD2 and integrate catalog discovery. Use named styles, not `Hair_01` labels.

Acceptance: no obviously exposed scalp holes outside intentional part, no rigid dark helmet, curl silhouette intact, no hair clipping through ears/forehead, valid motion, stable alpha, adequate frame cost on the actual phone.

## Repository layout / current boundaries
- **Existing:** `inspect_character.py`, `inspect_source.py`, `extract_source_scalp.py` (optional debug), `cap_geometry.py` + `build_scalp_cap.py` (fallback only), `character_profiles/vesper.json`, `styles/curly_mane.json`, `test_cap_geometry.py`, documentation and dev/staging comparison switches.
- **Not yet implemented:** `fit_hair.py` (root-only geometry fit), `validate_fit.py` (rig/UV/gap checks), `render_qa.py` (reproducible camera matrix), LOD/export integration.
- **Out of scope:** any male character/garment fitting and production UI updates.

Keep all original/purchased vendor FBX, source maps, new .blend working copies and redistributed derivatives private unless licensing establishes release rights. Never publish just because a technical test passes.

## Implemented Blender authoring commands

1. Inspect the character's actual head meshes and armature, from its **real binary GLB** (not a Git LFS pointer):
```sh
blender -b --python scripts/hair/fit/inspect_character.py -- --character-glb /private/vesper.garage.glb --report /private/fit/vesper-head.json
```
2. Inspect vendor geometry without fitting:
```sh
blender -b /private/vesper_head_guides.blend --python scripts/hair/fit/inspect_source.py -- --source "/private/CURLY 01.FBX" --config scripts/hair/fit/styles/curly_mane.json --report /private/fit/curly-source.json
```
3. After authoring a closed `AV_HairlineLoop` and `AV_Crown`, **dry-run** the cap generator (armature/bone/up/units shown are examples, verify from the source):
```sh
blender -b /private/vesper_head_guides.blend --python scripts/hair/fit/build_scalp_cap.py -- --armature-object Armature --head-bone head --up-vector 0,0,1 --meters-per-unit 1.0 --report /private/fit/cap-preflight.json
```
4. The `--write --output-blend /private/vesper_scalp_foundation_v2.blend` option writes only a NEW editable Blender file. See [QUICKSTART.md](QUICKSTART.md) for full instructions and required visual QA.
5. Later phases (`fit_hair.py`, root deformation and GLB/LOD exporter) remain **not implemented**, and are not safe to run from previous command examples.

Local pure-Python geometry tests: `python -m unittest discover -s scripts/hair/fit -p 'test_*.py' -v`. Blender integration and photo QA still pending.

## Responsibilities and compatibility
- **Wardrobe branch:** Blender authoring, geometry, rig fit, private assets, automated QA, exports and fit manifests.
- **UI branch:** hairstyles listing/discovery, auto-added bonnet metadata, toggles, avatar portrait and camera controls. Share stable ID, names, GLB paths, LOD paths and headwear contract; don't change the same files in both branches without integration.
- Existing twelve fitted styles remain unchanged until selectively migrated.
- No merge or staging deployment until the pilot geometry has been inspected and approved.

## Decisions to confirm from actual character assets before coding
- Which Vesper mesh represents the **neutral, uncapped head**? GLB names are not sufficient to infer the correct Blender object/rig.
- What are the actual coordinate units, face winding, head bone and scalp tag? No runtime assumptions.
- Do vendor FBXs have distinguishable root strips / disconnected curls? Inspect and annotate as needed.
- Does the vendor license allow shipping derived hair as GLBs/texture data to customers? Do not infer from purchase.
