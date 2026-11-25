# Universal Hairstyle Fitting — Avensky V2 (design and acceptance spec)

Status: **measured-scalp authoring milestone implemented; actual Vesper fitting pending**. The branch has a read-only character and hairstyle inspector, tested portable cap geometry, and an opt-in Blender builder. The user's actual Vesper scalp ring/crown have not been measured and no fitted GLB exists. Existing accepted hairstyles and live assets are unchanged. See [QUICKSTART.md](QUICKSTART.md) for executable commands and prerequisites.

## Why V1 did not solve the gaps
The existing `scripts/hair/blender_apply_batch.py` explicitly preserves the twelve fitted meshes' vertex positions, topology, skin, UVs and shape keys. It improves the material only. The donor texture archive contains three *separate* FBX meshes (`CURLY 01.FBX`, `CURLY 02.FBX`, `CURLY 03.FBX`) with their own geometry/UVs; the V1 material donor workflow does not fit those geometry meshes to Vesper. See `docs/assets/CURLY_SET_AUDIT.md`.

**Principle:** Do not mistake an alpha texture, a shell, or duplicated flat cards for actual hair density. A head-derived cap covers the skull and provides roots; original clumps must provide volume and silhouette. Any extra interior clumps require author approval and QA.

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

### 2 — Create a fitted scalp cap
Duplicate just the tagged scalp region of the neutral evaluated head into a **new** mesh; remove unselected triangles, preserve surface continuity/UV when possible, position the cap 1–2 mm outwards in character-scale meters as a starting **tunable** offset (check real units). Extend only to approved hairline/temples/nape, stopping before forehead skin and ears. Weight rigid to head bone or use copied head skin weights if rotation/face deformation requires them. Give roots a darker, textured non-shiny material matching the source hair; optionally feather hairline with small wisps. Do not simply paint a skull-sized opaque helmet.

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
4. Generate fitted cap; root-conform in 3 passes, never using global shrinkwrap.
5. Evaluate front/back/side/top plus head turns and high-collar/bonnet poses.
6. Only after one approved original-looking fit, generate LOD1/LOD2 and integrate catalog discovery. Use named styles, not `Hair_01` labels.

Acceptance: no obviously exposed scalp holes outside intentional part, no rigid dark helmet, curl silhouette intact, no hair clipping through ears/forehead, valid motion, stable alpha, adequate frame cost on the actual phone.

## Repository layout (proposed; not yet implemented)
```
scripts/hair/
  README.md                    # old material-only batch (retain)
  fit/README.md                # this plan
  fit/character_profiles/vesper.json
  fit/styles/curly_mane.json
  fit/inspect_source.py        # dry-run Blender importer / analysis
  fit/fit_hair.py              # author-confirmed alignment, cap and root fitting
  fit/validate_fit.py          # numeric + GLB import checks
  fit/render_qa.py             # camera matrix render receipt
  fit/tests/                  # geometry, unit and transform fixtures
```
All commercial FBX, paid texture maps, generated vendor derivatives, and previews stay outside the public repository unless rights are independently confirmed. The public branch should only contain our original scripts/config/docs and test fixtures.

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
