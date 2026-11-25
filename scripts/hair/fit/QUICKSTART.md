# Vesper scalp V2 — first usable geometry milestone

**Status:** authoring-only implementation. Pure geometry tests pass locally; Blender and game visual QA have **not** been run against the private Vesper source. Do not merge, auto-install, or deploy resulting geometry.

## Why the old cap must remain separate
The runtime `villager-scalp-cap` is a bonnet/hood fallback constructed from hard-coded spherical coordinates in `villagerModel.ts`. It is **not** a measurement-derived universal scalp. Keep it for its existing headwear use. The new `AVSK_ScalpFoundation_V2` is a separate Blender-authored, head-specific foundation to evaluate for imported hairstyles.

### New modules
- `inspect_character.py`: read-only inspection of Vesper GLB or private Blender scene, listing head/face candidate meshes, open boundaries and head-bone candidates.
- `cap_geometry.py`: portable loft algorithm driven by an **artist-approved closed hairline boundary** and crown marker; rejects missing, disjoint, crossing and inverted landmarks. Supports arbitrary head orientation.
- `build_scalp_cap.py`: Blender dry run by default; generates UVs and dark matte root material, safely attaches to a named head bone, and saves only to a **new** .blend with explicit `--write`.
- `test_cap_geometry.py`: non-Blender unit tests for topology, winding, orientation and invalid geometry.
- `RUNTIME_COMPARISON.md`: previously added optional development/staging comparison for old cap vs imported hair backing.

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
