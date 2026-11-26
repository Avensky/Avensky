# Vesper Curly Mane hairline and profile review

Refined the boundary at the upper forehead, temples and sideburns, then filled smaller residual openings at the crown and rear. The earlier density pass is the baseline. The forehead stays open below the original hairline. The candidate retains all previous hair, original Face4 geometry and BaseColor. A separate layer adds 28 proportionally scaled copies of original Curly Mane components with the vendor UVs and textures. This pass adds 5,046 triangles, bringing the total preview to 66,368 donor and insert triangles.

| Camera | Previous projected scalp visible | Refined projected scalp visible |
| --- | ---: | ---: |
| Front | 33.1% | 20.2% |
| Back | 7.1% | 4.1% |
| Left | 12.9% | 9.0% |
| Right | 21.2% | 12.7% |
| Top | 2.7% | 1.9% |
| Three-quarter | 12.5% | 7.4% |

All six camera receipts, baseline coverage values, and Face BaseColor checksums matched the prior run. A separate original Face4 UV patch covering the central face was rendered in front, both profiles and three-quarter. All four before/after diagnostic mask pairs were byte-identical, including the small existing occlusion in the profiles. Fine hair remains around the forehead and cheeks. The percentages above measure projected scalp opacity coverage in each view. Rig behavior and phone rendering remain unverified. The Blender scene, source assets, private plans and PNGs stay private.

## Replay the private preview

Use the retained earlier density review scene, its existing insert object and the new source-specific plan. The plan uses the same component, world anchor, rotation and uniform scale schema as the [crown and back density pass](CURLY_CROWN_BACK_DENSITY_REVIEW.md). Review source-curl shape and placement against the source reference using the matched PNGs.

~~~powershell
$blender = "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe"
$fit = "scripts/hair/fit"
$private = "C:/AvenskyPrivate/curly"
$atlas = "$private/CURLY SET/Hair Textures/Curls"

& $blender -b "$private/density-review.blend" --python-exit-code 1 --python "$fit/add_curly_crown_back_inserts.py" -- --plan "$private/hairline-plan.json" --insert-name AVFIT_CurlyMane_HAIRLINE_REVIEW --out-blend "$private/hairline-review.blend" --report "$private/hairline-review-receipt.json"

& $blender -b "$private/hairline-review.blend" --python-exit-code 1 --python "$fit/render_curly_coverage.py" -- --before AVFIT_CurlyMane_LOCAL_REVIEW --after AVFIT_CurlyMane_LOCAL_REVIEW --shared-inserts AVFIT_CurlyMane_CROWN_BACK_INSERT_REVIEW --after-inserts AVFIT_CurlyMane_HAIRLINE_REVIEW --framing-before AVFIT_CurlyMane_GLOBAL_PREVIEW --framing-hair Curly_Mane --diffuse "$atlas/DIFFUSE_AUBURN.png" --opacity "$atlas/OPACITY.png" --normal "$atlas/NORMAL.png" --out-dir "$private/hairline-coverage" --size 480 --samples 32 --threads 9
~~~

Verified original scalp geometry and texture, source-corner UV parity and planned placement after reopening the Blender preview. All 45 local authoring tests passed. The candidate remains at the visual approval gate.
