# Vesper Curly Mane crown and back density review

This is a private density pass on the approved-to-edit local fitting scene. The previous arrangement remains the baseline. The original curled donor, Face4 mesh and scalp texture are unchanged. The new review scene adds a separate layer of 29 proportional copies of original Curly Mane components. Each copy retains the source polygon shapes, loop UVs, custom normal directions under rotation and matching Curls textures. No original curl was moved in this pass.

## Matched Blender views

| Camera | Previous fit visible scalp | Density preview visible scalp |
| --- | ---: | ---: |
| Front | 33.7% | 33.1% |
| Back | 18.0% | 7.1% |
| Left | 17.4% | 12.9% |
| Right | 25.5% | 21.2% |
| Top | 4.9% | 2.7% |
| Three-quarter | 12.8% | 12.5% |

The opacity values measure the projected provisional Face4 scalp, including partially transparent hair. The stronger pass closed most of the remaining rear openings, with a few smaller part lines visible. In the top render the bright skin at the front edge includes Vesper's face and forehead. The measured central face patch was unchanged in front, both profiles and three-quarter. Forehead visibility remains a separate silhouette choice. The six camera receipts and baseline exposure values matched the prior review.

The new layer adds 4,215 vertices and 5,486 triangles, approximately 9.8% over the original 55,836 donor triangles. It awaits visual approval, rig checks and device testing. Blender reload checks confirmed the source UVs were copied exactly, the inserted positions matched their private transforms, and the original head geometry and Face BaseColor were retained. All 45 local tests passed.

## Reproduce the private comparison

Use the previous local review scene with the original donor objects retained and a private insert plan. Each plan record uses the rigid-edit schema from [the local refinement review](CURLY_LOCAL_REFINEMENT_REVIEW.md) and adds the positive uniform `scale` of the interior curl copy. The selection was ranked against the original opacity atlas, then refined around samples on real rear scalp triangles visible in the back camera. The plan, scene and rendered derivatives remain private.

~~~powershell
$blender = "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe"
$fit = "scripts/hair/fit"
$private = "C:/AvenskyPrivate/curly"
$atlas = "$private/CURLY SET/Hair Textures/Curls"

& $blender -b "$private/local-review.blend" --python-exit-code 1 --python "$fit/add_curly_crown_back_inserts.py" -- --plan "$private/crown-back-plan.json" --out-blend "$private/density-review.blend" --report "$private/density-review-receipt.json"

& $blender -b "$private/density-review.blend" --python-exit-code 1 --python "$fit/render_curly_coverage.py" -- --before AVFIT_CurlyMane_LOCAL_REVIEW --after AVFIT_CurlyMane_LOCAL_REVIEW --after-inserts AVFIT_CurlyMane_CROWN_BACK_INSERT_REVIEW --framing-before AVFIT_CurlyMane_GLOBAL_PREVIEW --framing-hair Curly_Mane --diffuse "$atlas/DIFFUSE_AUBURN.png" --opacity "$atlas/OPACITY.png" --normal "$atlas/NORMAL.png" --out-dir "$private/density-coverage" --size 480 --samples 32 --threads 8
~~~
