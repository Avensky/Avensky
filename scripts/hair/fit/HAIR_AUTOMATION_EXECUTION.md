# Vesper hair-fitting automation: exact steps and handoff

Checkpoint: November 25, 2026. Female Vesper and Curly Mane only. Draft PR #67. No merge, deployment, source replacement, or shipping GLB.

## Confidence and boundaries

- High confidence: original-source inspection, global-fit candidates, root/surface measurements, safe prototype adjustments, reproducible PNG comparison, scripted QA in normal ChatGPT.
- Moderate confidence: reaching a convincing static match to the original vendor's rounded, dense spiral bob without Work, provided the real crown gaps and face-overlapping strands are corrected.
- Not yet demonstrated: a one-click arbitrary hairstyle fitter, reliable automatic donor root identification, Blender rig/pose integration, alpha-aware gap maps, and actual phone/game acceptance.

A root touching the head is not the same thing as a hairstyle covering the scalp. Geometry contact, alpha-visible coverage, and runtime behavior MUST be separate acceptance gates.

## Confirmed original inputs

- SK_Village_Lady_Face4.fbx: real full skull (6,330 vertices; 8,915 source triangles).
- T_Villager_Lady_Face_BaseColor.tga: original skin color and natural, speckled scalp/hairline fade. Never replace it with a painted brown sphere or synthetic cap.
- CURLY 01.FBX: actual donor (42,685 vertices; 55,836 triangles; 253 connected card groups).
- Curls OPACITY.png and DIFFUSE_AUBURN.png: matching original donor UV atlas, not the separately supplied STRAIGHT family.
- Original vendor CURLY MANE 55,800-tri front/profile image: silhouette/style target, not a calibrated 3D coordinate source.

## What changed in this milestone

We added exact nearest-triangle surface measurements instead of nearest sampled scalp vertices.

The FIRST offline measurement used a PROVISIONAL original-face-texture-derived scalp region (220 scalp candidate vertices / 295 Face4 triangles), 209 provisional higher-UV-end donor root candidates, and a temporary conversion of 1 original source unit = 1 cm:

| Metric | Floating before global fit | After global candidate |
| --- | ---: | ---: |
| Median nearest scalp triangle | 196.19 mm | 10.02 mm |
| p95 nearest triangle | 228.62 mm | 28.11 mm |
| Candidate roots beyond 20 mm warning | 209 | 39 |
| Candidates whose local triangle normal offset is below -2 mm | 0 | 45 |

IMPORTANT: These are diagnostics only. The 45 negative offsets are not verified collisions; the scalp is an open mesh, the mask is not artist-approved, the normals are local, and the vendor FBX-to-Blender units still require confirmation. Some exterior cards should intentionally sit away from skin. Do not convert these counts into automatic corrective movement or production pass/fail.

## New scripts and role separation

| Script | Environment | Function |
| --- | --- | --- |
| surface_fit_metrics.py | System Python, NumPy, SciPy | Exact nearest TRIANGLE geometry and local signed-normal-offset measurements; reads arrays without modifying mesh |
| test_surface_fit_metrics.py | System Python | Eight passing synthetic tests: interior/edge cases, long-triangle search, invalid inputs, source immutability |
| export_curly_fit_probe.py | Blender background | Reads actual saved PRIVATE .blend, verifies original Face BaseColor and approved scalp group; exports source-derived PRIVATE NPZ plus source hashes |
| audit_fit_npz.py | System Python, NumPy, SciPy | Calculates contact_report.json and contact_by_curl.csv; optionally compares baseline/candidate of same head/root IDs/units |
| coarse_scalp_alignment.py | System Python | Global uniform scale/translation before local deformation |
| auto_align_curly_mane.py | Blender prototype | Makes NEW non-destructive global alignment review .blend only when opted in |
| reference_shape_ops.py | System Python | Preview-only bounded card root/length changes; NOT a photo-to-hair fitting solver |

Never commit original commercial FBX/TGA, private Blender projects, derivative GLB, per-vertex NPZ/CSV, preview PNGs or the vendor image to the public repository.

## Required per-character Vesper calibration

1. Load the ORIGINAL Face4 and map the real Face BaseColor onto its original UV layer. Use a neutral rig pose and confirm it matches the actual in-game derivative.
2. Verify local/world axes and units: Face4 source FBX uses different unit metadata from Curly Mane. Raw "0.92 scale" and "-21.6 Y" from source analysis are NOT confirmed Blender transforms.
3. Paint / review vertex group AV_ScalpRegion on real head geometry: top/crown/temples/back/nape only; exclude face, ears, eyes, eyebrows and bare forehead. This ONE-TIME group is reused across female hairstyles.
4. On Curly Mane, identify and mark true source attachment roots in AV_RootWeight. Automated higher-UV-end guesses are provisional; choose --allow-heuristic-roots only to generate a review report, not to approve fit.
5. Save two NEW private Blender scenes: a neutral baseline donor and a candidate globally aligned donor. Keep the same Face4 skull, UV, rig, marked scalp triangles, coordinate system and curl component IDs.

## Reproducible Windows PowerShell commands

Replace all sample locations, object names and unit conversion with ACTUAL verified values. The exact Blender exe may be under a different installed version.

~~~powershell
$blender = "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
$metersPerUnit = "1.0" # ONLY if the imported Blender world units really are meters

& $blender -b "C:\AvenskyPrivate\curly\vesper-curly-baseline.blend" --python scripts/hair/fit/export_curly_fit_probe.py -- --head Face4 --hair Curly_Mane --meters-per-unit $metersPerUnit --allow-heuristic-roots --out "C:\AvenskyPrivate\curly\baseline-probe.npz" --report "C:\AvenskyPrivate\curly\baseline-export.json"

& $blender -b "C:\AvenskyPrivate\curly\vesper-curly-global-candidate.blend" --python scripts/hair/fit/export_curly_fit_probe.py -- --head Face4 --hair AVFIT_CurlyMane_GLOBAL_PREVIEW --meters-per-unit $metersPerUnit --allow-heuristic-roots --out "C:\AvenskyPrivate\curly\candidate-probe.npz" --report "C:\AvenskyPrivate\curly\candidate-export.json"

py -m pip install numpy scipy
py scripts/hair/fit/audit_fit_npz.py --input "C:\AvenskyPrivate\curly\candidate-probe.npz" --baseline "C:\AvenskyPrivate\curly\baseline-probe.npz" --out-dir "C:\AvenskyPrivate\curly\contact-audit-v1"

py -m unittest discover -s scripts/hair/fit -p "test_*.py" -v
~~~

The exporter uses the original Face BaseColor and approved Face4 scalp geometry. It writes PRIVATE NPZ and a JSON receipt, not a render or fitted hairstyle. The offline audit verifies that before/after scalp vertices, root island IDs, and units match; otherwise it refuses comparison. Every output name must be new to prevent overwriting evidence.

If the Blender workbench already contains an empty AV_RootWeight group, the explicit --allow-heuristic-roots switch still forces a PROVISIONAL upper-end classification. Remove this flag after painting actual roots.

## What the numbers mean

- distance_mm: actual closest point to one of the APPROVED scalp triangles, including triangle interiors, not just vertex samples.
- local_normal_offset_mm: projection onto the nearest triangle normal, NOT true inside/outside for an open head.
- 20 mm gap and -2 mm inward limits: initial REVIEW FLAGS, not final production tolerances.
- Closest root-to-scalp distance is NOT a scalp-coverage metric; alpha cards can overlap visually, and intentional part lines may show original follicle texture.
- With provisional upper-UV ends, per-island scores are only hypotheses about roots. Manual confirmation is necessary before any deformation.

## Next four gates for automation

### Gate A: calibrated source scene
- [x] Original Face4 skull, Face BaseColor, donor geometry, Curls opacity/diffuse and vendor appearance identified.
- [x] Provisional global alignment performed; vendor look-reference compared.
- [ ] Verify importer physical units, same-world head/bone coordinates and shape-key/rig compatibility.
- [ ] Approve one-time AV_ScalpRegion and per-style AV_RootWeight.

### Gate B: measurable true-surface root fitting
- [x] Exact triangle surface metric, private probe export, offline report and 8 synthetic unit tests.
- [x] Initial real-source approximate-mask measurement recorded above.
- [ ] Repeat on author-approved scalp/roots after true Blender import; compare with baseline.
- [ ] Build tangent-aware, smoothly tapered local root solver with max displacement and zero-weight-tip protection.
- [ ] Review suspicious roots; keep outer curls voluminous.

### Gate C: visual coverage, not just contact
- [ ] Freeze front, back, left, right, top, three-quarter PNG cameras with fixed lighting/exposure.
- [ ] Use REAL original Face4 color and original donor Curls diffuse/opacity/normal atlases.
- [ ] Build an alpha-aware visible-scalp coverage map by camera and distinguish intended parts from bald crown/back patches.
- [ ] Position extra interior root clumps conservatively, preserving donor UVs and spiral shape.
- [ ] No eye/nose/mouth-obscuring cards. Rounded, glossy vendor-like bob required.
- [ ] Human approval of PNG before any GLB output; user cannot open GLB links.

### Gate D: game and mobile
- [ ] Attach to actual Vesper head bone/skin, verify animations, expressions, bonnet and high collars.
- [ ] Export private LOD0/LOD1/LOD2, check alpha order/overdraw and frame rate on a real phone.
- [ ] Confirm style catalog, colors, save/reload and license/redistribution rights.
- [ ] Explicit user signoff, then merge and deploy separately.

## The automation target

After calibrating Vesper once, a NEW female hairstyle should: inventory original FBX and atlas, suggest roots, propose a global transform, write immutable source checksums, produce exact root contact CSV and six source-textured PNGs, and stop for human approval if root identities, coverage or collisions are ambiguous.

Do not promise full unattended fitting yet. Resume specifically at original scalp mask approval, root classification, and alpha-aware rear-crown coverage. Male hair/clothing remains deferred.
