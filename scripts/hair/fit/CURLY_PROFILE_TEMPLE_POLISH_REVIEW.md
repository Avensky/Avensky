# Vesper Curly Mane profile and temple polish

The user supplied the original Curly Mane vendor front/profile image as the silhouette reference and pointed out the curls projecting forward in Vesper's left profile. The reference stays private. This static Blender preview tucks six existing source cards with rigid transforms and adds eleven proportional copies from the original hair at thin temple and sideburn spots. The existing curl shapes and original Face4 mesh and BaseColor are preserved. Reopening Blender confirmed donor edge lengths and UVs were retained, new copy UVs exactly matched the donor loops, and the scalp geometry and original texture remained intact. The new inserts add 1,940 triangles. Rig and device checks remain open.

## Six locked cameras

| Camera | Previous projected scalp visible | Polished projected scalp visible |
| --- | ---: | ---: |
| Front | 20.2% | 18.5% |
| Back | 4.1% | 4.0% |
| Left | 9.0% | 7.4% |
| Right | 12.7% | 8.0% |
| Top | 1.9% | 1.9% |
| Three-quarter | 7.4% | 6.6% |

Two separate opacity checks distinguish wisps in front of the face outline from hair overlapping the face itself. For the outline, Blender rendered the actual Face4 silhouette and vendor-opacity hair into linear passes with the existing side cameras. Over the measured band extending up to 50 mm ahead of the brow-to-chin profile, alpha-weighted hair fell from 9.40% to 0.65% on the left and from 9.41% to 0.61% on the right. Fine strands remain close to the temple and cheeks. On the central face patch, right-side overlap fell from 4.66% to 3.42%, left remained at 1.48%, and front and three-quarter were zero at reporting precision. All six camera receipts and baseline coverage measurements matched the previous hairline review.

## Replay the private review

Use the prior hairline review scene with both existing insert objects, the private rigid curl edit plan, and the private temple insert plan. See the [local refinement](CURLY_LOCAL_REFINEMENT_REVIEW.md) and [density](CURLY_CROWN_BACK_DENSITY_REVIEW.md) notes for their schemas. Keep private plans, source images, input and output Blender files, and rendered PNGs outside the repository.

~~~powershell
$blender = "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe"
$fit = "scripts/hair/fit"
$private = "C:/AvenskyPrivate/curly"
$atlas = "$private/CURLY SET/Hair Textures/Curls"

& $blender -b "$private/hairline-review.blend" --python-exit-code 1 --python "$fit/apply_curly_card_review.py" -- --hair AVFIT_CurlyMane_LOCAL_REVIEW --output-name AVFIT_CurlyMane_PROFILE_POLISH --plan "$private/profile-polish-plan.json" --out-blend "$private/tucked-review.blend" --report "$private/profile-polish.json"

& $blender -b "$private/tucked-review.blend" --python-exit-code 1 --python "$fit/add_curly_crown_back_inserts.py" -- --plan "$private/temple-polish-plan.json" --insert-name AVFIT_CurlyMane_TEMPLE_POLISH --out-blend "$private/profile-review.blend" --report "$private/temple-polish.json"

& $blender -b "$private/profile-review.blend" --python-exit-code 1 --python "$fit/render_curly_coverage.py" -- --before AVFIT_CurlyMane_LOCAL_REVIEW --after AVFIT_CurlyMane_PROFILE_POLISH --shared-inserts AVFIT_CurlyMane_CROWN_BACK_INSERT_REVIEW --shared-inserts AVFIT_CurlyMane_HAIRLINE_REVIEW --after-inserts AVFIT_CurlyMane_TEMPLE_POLISH --framing-before AVFIT_CurlyMane_GLOBAL_PREVIEW --framing-hair Curly_Mane --diffuse "$atlas/DIFFUSE_AUBURN.png" --opacity "$atlas/OPACITY.png" --normal "$atlas/NORMAL.png" --out-dir "$private/profile-coverage" --size 480 --samples 32 --threads 9
~~~

All 45 local authoring tests passed. The candidate is paused for visual review.
