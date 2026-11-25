# Vesper Curly Mane collar clearance review

A shared private fit now clears Vesper's stock neckline and the Gothic high collar through the tested pose set. The original curl cards moved as rigid components around their upper anchors. The fit changed 85 connected cards and retained their geometry, UVs and original Curls maps. The lower locks sit higher and arc farther outward than in the previous pose review. Existing hair was retained its original dimensions. Five proportional source curls add 1,044 triangles along thinner scalp edges. The original Face4 scalp geometry and BaseColor are intact.

The private authoring pass ranked rigid moves against the swept surfaces of both posed garments and then confirmed the result against their actual triangles, checking the original Curls opacity at the intersections. It also checked the original Face4 cheek regions. The five fill curls were checked with the rest of the candidate. Reopening the Blender scene confirmed identical base curl edge topology and UVs. The maximum base curl edge-length delta was approximately 0.00022 mm, consistent with storage precision.

## Matched results

All 46 original pose samples and all 24 frames of the matched animated turn were rerun. The sample names, angles and expressions match the previous comparison. The original head and neck rig drives the poses, with the same private smile, cheek-puff and open-jaw stress shapes. At all sampled intersection locations across both garments and both cheeks, the original hair opacity measured zero. Some transparent sections of cards geometrically cross these surfaces. This is a static fit on a rigid head attachment across sampled poses. Runtime shading, simulation and adjacent wardrobe variants are separate checks.

Scalp coverage used the original six cameras and compared the previous fit against the shared clearance fit. The left temple/sideburn region showed less projected scalp. The right sideburn region showed 0.4 percentage points more projected scalp and remains approximately 94% covered in the right profile.

| Review region | Previous projected scalp visible | Collar-clearance fit |
| --- | ---: | ---: |
| Front scalp | 18.5% | 17.8% |
| Back scalp edge | 4.0% | 4.2% |
| Left profile scalp | 7.4% | 7.2% |
| Right profile scalp | 8.0% | 8.5% |
| Crown | 1.9% | 1.9% |
| Three-quarter scalp | 6.6% | 5.7% |
| Left temple and sideburn subset | 9.1% | 6.3% |
| Right temple and sideburn subset | 5.5% | 5.9% |

## Private replay

Use the previous polished Blender scene and the two private plans. The rigid plan follows the [local review schema](CURLY_LOCAL_REFINEMENT_REVIEW.md). The edge plan follows the [source insert schema](CURLY_CROWN_BACK_DENSITY_REVIEW.md). Keep the commercial assets, private plans, scenes and generated images outside the repository.

~~~powershell
$blender = "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe"
$fit = "scripts/hair/fit"
$private = "C:/AvenskyPrivate/curly"
$atlas = "$private/CURLY SET/Hair Textures/Curls"

& $blender -b "$private/profile-review.blend" --python-exit-code 1 --python "$fit/apply_curly_card_review.py" -- --hair AVFIT_CurlyMane_PROFILE_POLISH --output-name AVFIT_CurlyMane_COLLAR_CLEARANCE --plan "$private/collar-rigid-plan.json" --out-blend "$private/collar-rigid.blend" --report "$private/collar-rigid.json"

& $blender -b "$private/collar-rigid.blend" --python-exit-code 1 --python "$fit/add_curly_crown_back_inserts.py" -- --plan "$private/collar-edge-plan.json" --insert-name AVFIT_CurlyMane_COLLAR_EDGE_REVIEW --out-blend "$private/collar-review.blend" --report "$private/collar-edge.json"

$assets = @("--main-hair", "AVFIT_CurlyMane_COLLAR_CLEARANCE", "--extra-hair", "AVFIT_CurlyMane_COLLAR_EDGE_REVIEW", "--hero", "$private/Vesper_CC_Hero_Textured.glb", "--collar", "$private/gothic-high-collar.garage.glb", "--diffuse", "$atlas/DIFFUSE_AUBURN.png", "--opacity", "$atlas/OPACITY.png", "--normal", "$atlas/NORMAL.png")

& $blender -b "$private/collar-review.blend" --python-exit-code 1 --python "$fit/review_curly_pose_clearance.py" -- @assets --out-dir "$private/collar-poses" --size 540 --samples 32 --threads 7
& $blender -b "$private/collar-review.blend" --python-exit-code 1 --python "$fit/review_curly_turn_loop.py" -- @assets --out-dir "$private/collar-turn" --size 300 --samples 10 --threads 7 --preview-only
~~~

All 48 local tests passed. A metrics-only replay of the motion script matched the rendered loop's report exactly. The private candidate remains at the visual approval gate.
