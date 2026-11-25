# Vesper female hair — source-first quickstart and safe resume

**Status:** the original **complete Face4** and **actual Face BaseColor with natural scalp discoloration** have been identified and rendered together. Source inventory/prototype scripts exist; a validated Curly Mane fit, Blender/phone QA and GLB output are NOT finished. Work is **Vesper-only**; male hair and clothes remain paused.

**First read:** [FEMALE_HAIR_PROGRESS_AND_LESSONS.md](FEMALE_HAIR_PROGRESS_AND_LESSONS.md) and [AUTOMATION_READINESS.md](AUTOMATION_READINESS.md). Don't start over with synthetic scalp caps or recolored flat-card textures.

## The correct first action: use Vesper's real scalp color

**Required original inputs:** `SK_Village_Lady_Face4.fbx` and **`T_Villager_Lady_Face_BaseColor.tga`** (not `Face_BaseColor_ID`). Optionally load the original skeleton from `SK_Village_Lady.fbx` and stock `SK_Village_Lady_Hair20.fbx` as a retained comparison.

1. Open a PRIVATE neutral character Blender scene and import the original Face4 FBX/rig.
2. Verify actual imported object names, UVs, transforms, bone names, camera axis and meters-per-unit. Do not assume raw FBX units are Blender meters.
3. Assign the real `T_Villager_Lady_Face_BaseColor.tga` to the original Face4 skin material using **its original UVs**. Verify it shows Vesper's actual skin color and natural speckled gray-brown scalp/hairline fade. No extra cap, sphere, or brown paint at this step.
4. Save a locked neutral head reference scene and front/back/left/right/top/three-quarter fixed-camera screenshots with the hair hidden.
5. Import one original donor style (Curly Mane) with its **own** matching UV/texture atlas. Fit and check actual root strips against the source Face4 surface. **This root-only fitter is not implemented yet; do not run a fictional `fit_hair.py` command.**
6. If there are actual gaps after a first fit, supplement only those areas with local follicle/root pigment or sparse under-clumps. Preserve intentional part lines and the source scalp texture.
7. Only after a successful fit and source-verified six-view QA proceed to LOD/export, game and phone checks.

**No new scalp cap is needed as a prerequisite.** Original Face4 already covers the skull and its Face BaseColor supplies a better follicle appearance than the previous solid-color overlay.

## Optional diagnostics only — source-derived scalp extraction

If visual QA shows a specific gap that needs a separate local root-covering layer, you **may** create a private prototype from selected original Face4 faces. This remains experimental; it uses a uniform debug material and **does not restore the original scalp texture on its own**.

- In a private `.blend`, manually annotate a vertex group `AV_ScalpRegion` on Face4 (include only approved coverage; exclude ears, eyes, face and forehead below the hairline).
- Run `extract_source_scalp.py` in dry-run mode with verified `--meters-per-world-unit`.
- Only if the region is satisfactory, add `--write --output-blend` to produce a **new** private .blend for review. Do not replace the default Face4 or ship the matte debug surface.

Example (change Windows paths, imported object/material names and units to the actual scene):

```powershell
blender -b "C:\AvenskyPrivate\vesper-face4-skin.blend" --python scripts/hair/fit/extract_source_scalp.py -- --head-object Face4 --region-group AV_ScalpRegion --face-material Face --meters-per-world-unit 1.0 --report "C:\AvenskyPrivate\fit\scalp-debug-preflight.json"
```

**Important:** Original FBX is Y-up with a centimeter-style scale convention. The example `1.0` is *not* verified and may be wrong after import. Document actual imported world units before attempting any mm offset or export.

## Why the old cap must remain separate
The runtime `villager-scalp-cap` is a bonnet/hood fallback constructed from hard-coded spherical coordinates in `villagerModel.ts`. It is **not** a measurement-derived universal scalp. Preserve its existing headwear behavior, but **do not enable it globally**. The separate synthetic `AVSK_ScalpFoundation_V2` is an earlier fallback prototype, **unnecessary for Vesper when Face4 and real Face BaseColor are intact**.

### New modules
- `inspect_character.py`: read-only inspection of Vesper GLB or private Blender scene, listing head/face candidate meshes, open boundaries and head-bone candidates.
- `cap_geometry.py`: portable loft algorithm driven by an **artist-approved closed hairline boundary** and crown marker; rejects missing, disjoint, crossing and inverted landmarks. Supports arbitrary head orientation.
- `build_scalp_cap.py`: Blender dry run by default; generates UVs and dark matte root material, safely attaches to a named head bone, and saves only to a **new** .blend with explicit `--write`.
- `test_cap_geometry.py`: non-Blender unit tests for topology, winding, orientation and invalid geometry.
- `RUNTIME_COMPARISON.md`: previously added optional development/staging comparison for old cap vs imported hair backing.

## Fallback only: characters whose actual source head is incomplete

The rest of the earlier instructions (`AV_HairlineLoop`, `AV_Crown`, `build_scalp_cap.py`, and `run-scalp.ps1 -Mode cap-build`) document an **older synthetic-cap path**. They are NOT steps to perform for Vesper in this project. Retained for reference; do not use or optimize these while female fitting remains the scope.

## Windows shortcut: no Blender PATH configuration required

If PowerShell says `blender` is not recognized, use the included launcher instead. It searches the normal Blender installation directories and permits an explicit `-BlenderExe` path. All example names/units below still must be verified.

```powershell
.\scripts\hair\fit\run-scalp.ps1 -Mode inspect -CharacterGlb "C:\AvenskyPrivate\villager-female.garage.glb" -Report "C:\AvenskyPrivate\fit\vesper-head.json"
```

After authoring the `AV_HairlineLoop` and `AV_Crown` reference objects in the private .blend, dry-run the builder:

```powershell
.\scripts\hair\fit\run-scalp.ps1 -Mode cap-dry-run -SceneBlend "C:\AvenskyPrivate\vesper_head_guides.blend" -Armature "Armature" -HeadBone "head" -UpVector "0,0,1" -MetersPerUnit 1.0 -Report "C:\AvenskyPrivate\fit\cap-preflight.json"
```

To save a distinct new output after inspecting the dry-run report, change `-Mode` to `cap-build` and provide `-OutputBlend "C:\AvenskyPrivate\vesper_scalp_foundation_v2.blend"`. The launcher rejects an output path that already exists.

## Step 1 — inspect the original avatar, not the bonnet geometry

Use **the true current female character GLB**, e.g. the private original or
`frontend/public/models/characters/villagers/villager-female/villager-female.garage.glb`. This file is Git LFS-backed; a text pointer is not an actual GLB.

PowerShell from the repo root, with Blender installed and on PATH:

```powershell
blender -b --python scripts/hair/fit/inspect_character.py -- --character-glb "C:\AvenskyPrivate\villager-female.garage.glb" --report "C:\AvenskyPrivate\fit\vesper-head.json"
```

Read `armatures[].head_bone_candidates`, `meshes[].materials` and `meshes[].open_boundary_edges`. **The report cannot prove a full scalp exists.** Inspect actual polygons in Blender under a deliberately hidden bonnet and braid. Save the imported neutral character as a private working file (`vesper_head_guides.blend`).

## Step 2 — annotate ONE Vesper hairline in Blender

This is a **once-per-head** calibration, reused for all incoming hairstyles, not once per hairstyle.

1. Put Vesper in neutral/rest pose; keep original head, face, skeleton and bonnet unchanged.
2. In the outliner, identify the actual face mesh and head bone by the inspection report.
3. Add a Mesh Circle with 32 or more vertices (Blender: Add > Mesh > Circle), rename it `AV_HairlineLoop`. It must contain *only one closed ring of edges* (no faces, branches or duplicate vertices).
4. In Edit Mode, shape its vertices so the ring touches the **real head/hairline** at the forehead, temples, above/behind ears and nape. Use the face seam and actual anatomy, not the old spherical bonnet cap. Check side, rear and top views. Do not move the original head mesh.
5. Add an Empty named `AV_Crown` at Vesper's anatomical crown/top-of-skull location (relative to this ring). This must be above every hairline vertex in the chosen up direction.
6. Confirm Blender world up axis and actual metres per Blender unit. A glTF imported into Blender generally uses Z-up, but do not assume units/axes without checking transforms. Save the guide scene **privately** as `vesper_head_guides.blend`.

For hairstyles with a parting or exposed skin, the **shared** Vesper cap remains neutral: define visibility masks, wisps or additional clumps per hairstyle later. Avoid cutting the base scalp for each style.

## Step 3 — dry run, then generate editable cap

Use the armature and head-bone names from `vesper-head.json`. The following names and 1.0 unit conversion are **examples**, not verified values from the asset:

```powershell
blender -b "C:\AvenskyPrivate\vesper_head_guides.blend" --python scripts/hair/fit/build_scalp_cap.py -- --armature-object "Armature" --head-bone "head" --up-vector "0,0,1" --meters-per-unit 1.0 --report "C:\AvenskyPrivate\fit\cap-preflight.json"
```

No new mesh or .blend is saved by the default dry run. It writes dimensions, structural counts and explicit warnings to the report.

After validating the numbers:

```powershell
blender -b "C:\AvenskyPrivate\vesper_head_guides.blend" --python scripts/hair/fit/build_scalp_cap.py -- --armature-object "Armature" --head-bone "head" --up-vector "0,0,1" --meters-per-unit 1.0 --offset-mm 1.0 --report "C:\AvenskyPrivate\fit\cap-build.json" --write --output-blend "C:\AvenskyPrivate\vesper_scalp_foundation_v2.blend"
```

The builder refuses to overwrite an existing output or save to the input path, rejects implausible metric dimensions, requires a closed ring with the crown projection inside it, and sets `avensky_approved_for_release=false` on the generated cap. Cap has an `AVScalpUV` layer and a basic root-tone material (not a finished realistic hair shader).

## Step 4 — inspect before fitting any vendor hair

In the new editable .blend:
- Hide bonnet and existing braid. Isolate `AVSK_ScalpFoundation_V2` and examine its fit to the original face under different head poses.
- Verify forehead/temple/nape seam, ear clearance, cap normal direction, root material color, no face penetration or obvious floating shell, and bone attachment.
- Temporarily show a single imported **Curly Mane** source without deforming it to see what existing gaps are truly due to cap coverage and which require separate root fitting/under-clumps.
- Run six-view screenshots, and compare `baseline` / `backing` / `legacy-cap` from `RUNTIME_COMPARISON.md`. Keep the bonnet cap for the stock braid only.

**Not implemented yet:** Vesper-specific guide auto-extraction, curly source landmark retargeting, root-only deformation, mixed-root cap texture, alpha density repair, mobile LODs, runtime hair asset manifest wiring. No Blender output has been produced or visually approved at this stage.

## Local tests (no Blender required)

```sh
python -m unittest discover -s scripts/hair/fit -p 'test_*.py' -v
```

All seven scalp-math unit tests passed in the authoring environment. Python syntax checked for the new Blender builder but **Blender's `bpy` runtime was unavailable**, so final rig, geometry and GLB exporter behavior remain unverified.

## Privacy and licensing
Do not commit `CURLY HAIR SET.zip`, its FBX/PNG derivatives, private `.blend` files or fitted proprietary GLBs. Keep scripts/metadata in the public branch; verify redistribution terms before any staging or production release.
