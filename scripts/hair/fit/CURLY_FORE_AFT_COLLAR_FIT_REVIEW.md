# Vesper Curly Mane fore-and-aft collar fit

The earlier profile-polished fit is the reference. The shoulder-flare clearance variant remains an earlier comparison. This fit routes the 85 affected connected source cards forward or backward using rigid pitch about Blender world X and translation along world Y. The existing shapes, edge topology and UVs are preserved. The maximum side-to-side change after storing the edit was approximately 0.0000063 mm. The maximum measured edge-length change after reopening Blender was 0.00022 mm. Some ringlets sit a little higher or sweep farther in depth to clear the garments. No source curl was scaled or trimmed.

Eleven small proportional copies of source ringlets fill the right temple and sideburn and add 1,382 triangles. The original Face4 mesh and BaseColor are unchanged. In the matched right profile the measured temple/sideburn patch shows 4.7% visible scalp, down from 5.5% in the earlier drape. The left profile patch shows 8.7%, down from 9.1%.

## Clearance checks

Replayed the same 46 pose samples and all 24 frames of the animated turn. The sample angles and authored expression settings matched the previous Blender review. Every sampled intersection with the stock neckline, Gothic high collar and both checked cheek patches had zero original-hair opacity. Transparent card polygons can still cross the garment or cheek geometry. The render tests use Vesper's actual head and neck rig with the private expression stress shapes. Game integration and device testing remain outside this review.

All 48 local authoring tests passed. A Blender negative test confirmed that a plan with 10 mm of sideways movement is rejected before a scene is written. All model assets, private plans and review PNGs remain private.

## Private replay

Use the earlier polished profile review scene, before the clearance flare. Apply the private fore-and-aft plan, add the right sideburn layer, then run the existing [pose and turn preview harnesses](CURLY_COLLAR_CLEARANCE_REVIEW.md) with the specified base object and extra layer.

~~~powershell
$blender = "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe"
$fit = "scripts/hair/fit"
$private = "C:/AvenskyPrivate/curly"

& $blender -b "$private/profile-review.blend" --python-exit-code 1 --python "$fit/apply_curly_card_review.py" -- --hair AVFIT_CurlyMane_PROFILE_POLISH --output-name AVFIT_CurlyMane_FORE_AFT --fore-aft-only --plan "$private/fore-aft-plan.json" --out-blend "$private/fore-aft-rigid.blend" --report "$private/fore-aft-rigid.json"

& $blender -b "$private/fore-aft-rigid.blend" --python-exit-code 1 --python "$fit/add_curly_crown_back_inserts.py" -- --plan "$private/right-sideburn-plan.json" --insert-name AVFIT_CurlyMane_RIGHT_SIDEBURN --out-blend "$private/fore-aft-review.blend" --report "$private/right-sideburn.json"
~~~

Use `--main-hair AVFIT_CurlyMane_FORE_AFT --extra-hair AVFIT_CurlyMane_RIGHT_SIDEBURN` for both pose commands. The candidate remains at the visual approval gate.
