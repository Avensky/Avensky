# Vesper Curly Mane Blender coverage review

Run date November 25, 2026. Scope is original Face4 and `CURLY 01.FBX` for Vesper. The two states share the same rest head, approved-for-review frame, source donor topology, and Curls UVs. The preview applies a uniform object transform only. The scalp trace, root identities, and fit remain open for visual approval.

## Original imports and calibration

Blender 5.3.0 imported Face4 with 6,330 vertices and 8,915 triangles, and CURLY 01 with 42,685 vertices and 55,836 triangles. Directly inspected Blender world matrices show Face4 uses 0.01 m per imported local unit and maps local XYZ to world X, Z, -Y axes respectively (world XYZ equals local X, -Z, Y, plus object translation). The donor uses 0.0254 m per imported local unit and its imported local basis is already world-aligned. Scene axes for review are +Z up and -Y toward the face. The world head height is 236.7 mm. Direct import placed donor vertices at Z 3.778–4.858 m while Face4 spans Z 1.426–1.663 m.

The donor's FBX animation take restores the raw imported scale on load. The new calibration script clears that take in a new private review scene before applying the explicit 1/2.54 unit correction. This tests centimeter-sized donor authoring coordinates, backed by the relative face/donor dimensions. It is still an interpretation of the vendor asset. Confirm the intended hairstyle dimensions before accepting scale. The source FBX and TGA checksums matched after the run.

A conservative UV trace follows the natural speckled hairline on the central Face BaseColor island and picks the upper rear UV islands. Only the original Face material is eligible. The proposed group contains 155 vertices and 228 scalp triangles. The texture and mesh are untouched. Review ear edges, temples, nape and the hairline boundary in the same private scene before approving the reusable group.

## Contact and coverage evidence

Both probes use the same 209 provisional candidates from 253 connected components. All 209 eligible upper centers are at the higher-V end in the neutral donor. The other 44 failed the UV/end-band/vertical-span screening and still need inspection. The before and after positions come from the same reference roots and matching component IDs. Geometric consistency strengthens the root hypothesis. Attachment identity still needs human review, particularly interior versus exterior cards.

| Exact nearest Face4 scalp triangle | Before global placement | Global candidate |
| --- | ---: | ---: |
| Median distance | 194.16 mm | 10.84 mm |
| p95 distance | 226.58 mm | 30.21 mm |
| Above the 20 mm review threshold | 209 / 209 | 39 / 209 |
| Local normal offset below -2 mm | 0 / 209 | 36 / 209 |

The alignment reached the lower 0.92 scale bound. Displacement about the recorded pivot was approximately (-9.15, -21.49, -216.32) mm in Blender XYZ after donor normalization. Exact triangle distances are measured from candidate centers to the provisional group. Local signed normals flag inspection points on this open surface. They do not establish collisions.

| Camera | Before visible scalp | After visible scalp |
| --- | ---: | ---: |
| Front | 96.79% | 2.79% |
| Back | 62.83% | 56.40% |
| Left | 71.53% | 20.02% |
| Right | 79.84% | 29.09% |
| Top | 4.72% | 17.49% |
| Three-quarter | 73.98% | 7.11% |

These are projected pixel-equivalent fractions of the **provisional scalp in each camera**, with the rest of Face4 self-occluding. Blender Cycles renders a hair-hidden white scalp reference and two opacity-aware diagnostic passes from each fixed orthographic camera. Hair transmittance comes from the linear red channel of the matching grayscale Curls opacity, sampled on original UVs. Opaque card pixels cover the scalp, partial opacity transmits a fraction, and layers accumulate by camera depth. The CSV contact results answer a separate geometry question. The top camera can see floating cards in front of the scalp in the baseline, so lower baseline exposure there does not imply better root placement. Fractions are neither square centimeters nor game alpha results.

The global candidate brings the hair around the head. A broad upper-back opening remains, the top view shows open bands between curls, and fringe and side wisps overlap the face near the eye and cheek. The run preserved the original natural scalp color, source card topology and donor diffuse. The diagnostic images use the vendor Curls normal map at reduced strength and fixed studio lighting. Eye overlay polygons without source materials are hidden in the isolated beauty scene. This is a static neutral review. Hair pose, game shading, PBR map convention, bonnet and collar clearance, and mobile performance are pending.

## Repeat the private run in PowerShell

Use paths outside the repository for all source assets, intermediate scenes and generated images. Use new output names on every run. Follow the workbench preparation commands in [the execution guide](HAIR_AUTOMATION_EXECUTION.md), with the original Face4 FBX, original Face BaseColor, and donor CURLY 01. The prepared path below is `$private/source.blend`.

~~~powershell
$blender = "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe"
$blenderPython = "C:/Program Files/Blender Foundation/Blender 5.3/5.3/python/bin/python.exe"
$fit = "scripts/hair/fit"
$private = "C:/AvenskyPrivate/curly"
$atlas = "$private/CURLY SET/Hair Textures/Curls"

& $blender -b "$private/source.blend" --python-exit-code 1 --python "$fit/calibrate_curly_review.py" -- --assume-donor-centimeter-authoring --out-blend "$private/calibrated.blend" --report "$private/calibration.json"

# Install only into a private library folder for Blender's Python version.
& $blenderPython -m pip install --no-deps --target "$private/blender-libs" "scipy==1.16.3"
$env:AVENSKY_BLENDER_LIBS = "$private/blender-libs"
& $blender -b "$private/calibrated.blend" --python-exit-code 1 --python-expr "import os, sys; sys.path.insert(0, os.environ['AVENSKY_BLENDER_LIBS'])" --python "$fit/auto_align_curly_mane.py" -- --up 0,0,1 --meters-per-unit 1 --report "$private/alignment.json" --write --output-blend "$private/aligned.blend"

& $blender -b "$private/calibrated.blend" --python-exit-code 1 --python "$fit/export_curly_fit_probe.py" -- --head Face4 --hair Curly_Mane --meters-per-unit 1 --allow-heuristic-roots --out "$private/baseline.npz" --report "$private/baseline-export.json"
& $blender -b "$private/aligned.blend" --python-exit-code 1 --python "$fit/export_curly_fit_probe.py" -- --head Face4 --hair AVFIT_CurlyMane_GLOBAL_PREVIEW --root-reference Curly_Mane --meters-per-unit 1 --allow-heuristic-roots --out "$private/candidate.npz" --report "$private/candidate-export.json"

python -m pip install numpy scipy "Pillow>=10.1"
python "$fit/audit_fit_npz.py" --input "$private/candidate.npz" --baseline "$private/baseline.npz" --out-dir "$private/contact"
& $blender -b "$private/aligned.blend" --python-exit-code 1 --python "$fit/render_curly_coverage.py" -- --diffuse "$atlas/DIFFUSE_AUBURN.png" --opacity "$atlas/OPACITY.png" --normal "$atlas/NORMAL.png" --out-dir "$private/coverage" --size 480 --samples 32 --threads 10
python "$fit/compose_curly_coverage_sheets.py" "$private/coverage" "$private/sheets"
python -m unittest discover -s "$fit" -p "test_*.py" -v
~~~

Keep the existing `AV_RootWeight` group unapproved until root annotation. After hand-painting, omit `--allow-heuristic-roots` from both exports. The `--root-reference` comparison requires an undeformed donor copy and preserves the exact baseline candidate list when scale changes. Use the receipt's group, cameras, opacity maps and settings when comparing. Recalibrate when changing the underlying head, atlas, frame, or selected scalp triangles.

The output includes 12 textured PNGs, 18 grayscale maps (reference, before, after per camera), and a JSON report. The optional sheets show all six pairs and highlight top and back exposure for direct visual review. Source filenames and hashes are recorded privately by the original workbench and render receipts. Keep derivative PNGs, scene files, textures and root-level reports private.

## Verification and review gate

- 45 local Python unit tests passed, including four new coverage metric cases.
- The real Blender comparison ran twice at 480 px and 32 samples. With the same scene and camera settings, all 18 diagnostic maps were byte-identical and all per-view values matched across the two runs. Beauty lighting was tuned separately.
- A local Blender fixture measured 100% transmission for an opacity card behind the target, 49.8% for one half-opacity card in front and 24.8% with two stacked cards.
- Review the PNG sheets and approve the provisional scalp and the regions that should be filled before any local card moves or clump additions. The 0.92 scale bound, upper-back opening, face overlap and individual root identities remain open.
