# Curly Mane → Vesper: first real root-fitting pilot

**Status (2026-11-25): actual CURLY 01.FBX inspected; real Curls diffuse/opacity atlas used in a software preview; new global alignment candidate now surrounds Vesper's original textured head. Large crown/back gaps remain; no Blender/engine-approved, rigged, or game-ready result exists.** See [CURLY_GLOBAL_ALIGNMENT_GEOMETRY.md](CURLY_GLOBAL_ALIGNMENT_GEOMETRY.md).

**Scope:** Female Vesper only. No male hair/clothing, no production deploy or PR merge.

## Why we start with the original scalp

Vesper's original `SK_Village_Lady_Face4.fbx` already includes the full head, and `T_Villager_Lady_Face_BaseColor.tga` contains the **actual skin and natural gray-brown follicle/root coloration**. Use those exact original inputs and UVs. Never substitute a solid-color bonnet sphere or paint a new head cap by default.

The Curly Mane model from the donor source (`CURLY 01.FBX`, object name `Curly_Mane`) was recorded by the original 2026-11-18 audit as approximately 42,685 vertices and 55,836 triangulated faces. Its coordinate units and rig were not confirmed. The original Curls atlas belongs to Curly Mane's own UVs.

## Files implemented

| File | Use |
| --- | --- |
| `fit_math.py` | Proper-rotation similarity alignment and per-connected-curl root-only translation; zero-weight tips don't move |
| `test_fit_math.py` | Eight unit tests pass locally on synthetic meshes/landmarks |
| `prepare_curly_mane_workbench.py` | Import original Face4 + actual Face BaseColor + original Curly Mane into a *new private .blend*. No fitting. |
| `pilot_curly_mane.py` | Legacy manual-marker inspection/align only; old conform mode is DISABLED due potential mistaken tip selection. |
| `coarse_scalp_alignment.py` | Use upper UV ends as candidates; solve bounded global scale/translation against approved original Face4 scalp points. |
| `auto_align_curly_mane.py` | New dry-run Blender global fit; saves only a NEW private review .blend when explicitly requested; no individual root changes. |

## Run procedure (Windows, from Avensky repo root)

**Original files needed privately:** `SK_Village_Lady_Face4.fbx`, `T_Villager_Lady_Face_BaseColor.tga`, `CURLY 01.FBX`; optional original `Hair Textures/Curls/` atlas. Extract the ZIP locally, not into public Git.

### Step 1: create a new source comparison scene

Blender command below assumes Blender 5.2 at its usual Windows location and files under C:\AvenskyPrivate; replace paths as appropriate.

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --python scripts/hair/fit/prepare_curly_mane_workbench.py -- --face-fbx "C:\AvenskyPrivate\SK_Village_Lady_Face4.fbx" --face-basecolor "C:\AvenskyPrivate\T_Villager_Lady_Face_BaseColor.tga" --hair-fbx "C:\AvenskyPrivate\CURLY 01.FBX" --report "C:\AvenskyPrivate\curly\workbench.json" --out-blend "C:\AvenskyPrivate\curly\vesper-curly-workbench.blend"
```

The output is UNFITTED. Open the .blend, visually confirm Vesper's **real** faded scalp hairline and scalp texture, then compare the raw donor mesh in front, side, rear and top views. Verify Blender's actual meters-per-world-unit after FBX import; the raw source FBX axes/units must not be assumed.

### Step 2: annotate five paired landmarks and two root groups

Make a separate PRIVATE annotated copy of the workbench. Add five source EMPTY markers on genuine Curly Mane roots and matching target markers on the source textured Face4 scalp:

- Source: `AV_SRC_forehead`, `AV_SRC_crown`, `AV_SRC_temple_l`, `AV_SRC_temple_r`, `AV_SRC_nape`
- Target: `AV_DST_forehead`, `AV_DST_crown`, `AV_DST_temple_l`, `AV_DST_temple_r`, `AV_DST_nape`

On Face4, paint vertex group `AV_ScalpRegion` to **1** only over acceptable hair-root regions (not ears, forehead below hairline, eyelids or face). On Curly Mane, paint `AV_RootWeight` to **1 at true card/clump roots**, taper down smoothly to 0 along the short first section; leave middle body and tips at 0. **Never shrinkwrap all curls**. Save as `vesper-curly-annotated.blend` privately. This marking is the one-time Vesper/head calibration plus hairstyle-specific root identification.

### Step 3: inspection (report only)

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b "C:\AvenskyPrivate\curly\vesper-curly-annotated.blend" --python scripts/hair/fit/pilot_curly_mane.py -- --mode inspect --meters-per-world-unit 1 --face-basecolor "C:\AvenskyPrivate\T_Villager_Lady_Face_BaseColor.tga" --report "C:\AvenskyPrivate\curly\inspect.json"
```

**1 meter per world unit above is an example, not yet verified**. If imported coordinates retained centimeters, replace this with the true conversion. The original face TGA must be mapped to the original Face4 material.

### Step 4: global alignment FIRST (corrected workflow)

The earlier nearest-scalp UV-end method could mistake the LOWER end of a floating curl card for its actual root. The old pilot_curly_mane.py --mode conform path is now deliberately DISABLED. Do not run the old command.

Use the new auto_align_curly_mane.py with original Face4 + actual Face BaseColor and a HUMAN-APPROVED AV_ScalpRegion. It is dry-run by default, emitting a fit report. Confirm Blender's UP vector and meters per world unit. Only if the report is valid, use --write with a NEW --output-blend path; it duplicates and globally aligns the donor without per-curl deformation or GLB export.

Read [CURLY_GLOBAL_ALIGNMENT_GEOMETRY.md](CURLY_GLOBAL_ALIGNMENT_GEOMETRY.md) for measured source-coordinate results, source-vs-Blender unit warnings, and exact acceptance tests. The offline candidate uses scale approximately 0.92 with a downward shift of about 22 SOURCE-COORDINATE units; these numbers are not approved Blender settings. The actual Curls alpha test still shows scalp gaps and some face overlap.

Individual root conformance remains BLOCKED until global placement, root identities, and the actual hairline are visually approved.

### Step 5: visual acceptance before any GLB export

- [ ] Real Face4 skin and scalp speckles still visible; no fake cap or incorrect UVs.
- [ ] Front hairline, temples, ears, crown and nape make convincing contact with curly roots.
- [ ] Curly Mane still has its original volume and silhouette, with zero-weight tips unaltered.
- [ ] No false bald spots outside intentional parts, no jagged extra brown root layers.
- [ ] Check front, back, left, right, top and three-quarter views with stable lights and camera.
- [ ] Check head movements, bonnet, collars and alpha maps **after** correct skinning to Vesper.
- [ ] Validate Blender and game visual quality, then test phone GPU before LOD/catelog/release.

## What has NOT been automated yet

The earlier private offline trial moved 39 near-scalp sections (819 vertices, max 2 source-coordinate units), but preceded the corrected global placement and may have mistaken lower/tip ends for roots. Keep this as a regression case, not an accepted fit. That is **not** a completed Blender fit, and 214 components require human classification. The scripts implement deterministic coarse alignment and protected per-curl root motion, but donor roots/target scalp must still be annotated; automatic gap correction, full rig attachment, six-camera rendering, GLB LOD export, engine import and phone QA are not implemented. The fact that the math passes synthetic tests does **not** prove a real Curly Mane fit.

**Privacy:** commercial source ZIP/FBX/TGA, extracted vendor geometry and new private .blend files must NOT be committed to public GitHub until licensing is independently confirmed. PR #67 remains draft.