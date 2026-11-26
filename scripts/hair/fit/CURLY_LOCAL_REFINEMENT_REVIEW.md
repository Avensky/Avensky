# Vesper Curly Mane local refinement

November 25, 2026. Review-only revision after approval to adjust individual curls. The baseline is the earlier global candidate, with the same six cameras, orthographic scales, lighting, original Face4 texture and source Curls maps. The local preview remains a private Blender scene.

## What changed

We screened the actual hair-card opacity against the Face4 scalp and face, moved the highest-impact face-crossing cards onto rear and crown scalp sites, and swept other profile-crossing curls sideways or rearward. Each edit is a rigid transform on one existing connected card. We retained the original 42,685 vertices, 55,836 triangles, UVs and curl shapes, and rotated custom normals with their cards. We moved 40 cards (6,474 vertices). All other 36,211 source vertices, original Face4 vertices and UVs, and linked Face BaseColor stayed unchanged. On reloading the private scene, the maximum change in any recorded hair mesh edge length was about 0.0002 mm.

## Matched Cycles results

| Camera | Global fit scalp visible | Local refinement scalp visible |
| --- | ---: | ---: |
| Front | 2.8% | 33.7% |
| Back | 56.4% | 18.0% |
| Left | 20.0% | 17.4% |
| Right | 29.1% | 25.5% |
| Top | 17.5% | 4.9% |
| Three-quarter | 7.1% | 12.8% |

Fractions describe the projected provisional scalp in each camera. The broad rear gap broke up into smaller part openings. Smaller openings remain near the crown and rear. Moving the fringe cleared the face and exposes more of the original front hairline. The four-view projected face check uses a separate original Face UV patch spanning brows, eyes, nose, cheeks and mouth. Strand occlusion on that patch fell from 6.1% to under 0.1% from the front, 23.0% to under 0.1% from three-quarter, 67.9% to 1.4% from the left, and 63.8% to 4.8% from the right. Fine profile wisps remain.

On the same 209 provisional root centers, the exact-triangle contact median went from 10.84 to 9.43 mm. Warnings above 20 mm went from 39 to 33 and negative local offsets below -2 mm went from 36 to 35. The signed offsets are review flags on an open scalp. Contact, opacity coverage, visual balance, rig/animation, and device validation remain separate.

## Private replay

Use the previous global preview scene and the privately saved local edit plan. That plan contains source-specific component IDs, anchors and rigid transforms. Store it with the review scene outside the repository. The plan schema is a JSON array, with `component` (zero-based connected component index), `source_root` and `target_root` (Blender world XYZ), and `rotation` (proper 3×3 world rotation, row-major) for each card. Reuse the original workbench and address only the same imported donor topology.

~~~powershell
$blender = "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe"
$fit = "scripts/hair/fit"
$private = "C:/AvenskyPrivate/curly"
$atlas = "$private/CURLY SET/Hair Textures/Curls"

& $blender -b "$private/aligned.blend" --python-exit-code 1 --python "$fit/apply_curly_card_review.py" -- --plan "$private/local-review-plan.json" --out-blend "$private/local-review.blend" --report "$private/local-review-receipt.json"

& $blender -b "$private/local-review.blend" --python-exit-code 1 --python "$fit/render_curly_coverage.py" -- --before AVFIT_CurlyMane_GLOBAL_PREVIEW --after AVFIT_CurlyMane_LOCAL_REVIEW --framing-hair Curly_Mane --diffuse "$atlas/DIFFUSE_AUBURN.png" --opacity "$atlas/OPACITY.png" --normal "$atlas/NORMAL.png" --out-dir "$private/local-review-coverage" --size 480 --samples 32 --threads 10
~~~

All 45 local Python tests passed. Reopened Blender scene checks confirmed identical source topology and UVs and original Face4 geometry. The six camera receipts match the earlier global comparison. The preview is at the visual review gate and requires a fit decision before rigging or runtime work.
