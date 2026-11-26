# Vesper Curly Mane pose clearance review

Tested the polished Curly Mane on Vesper's original Face4 head and rig using the head and neck chain. The stock neckline comes from the local Vesper hero asset. The second garment is the Gothic high collar garage asset in its over configuration. The head, Vesper body and collar rigs registered within 0.001 mm at the tested neck and head bone locations. Hair travels with the head bone in this preview. The neutral mesh, hair shape, UVs, Face BaseColor, and original curl maps remain intact.

The available head had no facial morph targets. The review uses smooth private smile, cheek-puff, and open-jaw deformations on Face4 as expression stress tests. These are authored proxies for movement in the cheeks, lips and jaw. Runtime expression playback, dynamic hair motion, garment physics, and device tests remain open.

## Results

The sweep includes 46 samples with ±45° yaw, 20° up to 25° down, and mixed turns, pitch, tilt and expressions. Eight samples were rendered as review stills. The independently rendered and metrics-only reports matched exactly.

| Region | Samples with contact at opacity 0.5 or higher | Findings |
| --- | ---: | --- |
| Left cheek | 0 / 46 | Some underlying card triangles crossed the test patch. The sampled texels were fully transparent in every pose. |
| Right cheek | 0 / 46 | No triangle intersection in the marked test patch. |
| Stock neckline and upper garment | 45 / 46 | Lower front curls intersect part of the upper stock garment. Peak sample had 112 qualifying triangle pairs. |
| Gothic high collar | 46 / 46 | Lower curls penetrate the garment in neutral and across the sampled turns. Neutral had 767 qualifying triangle pairs. The strongest sample was +45° yaw with 1,631. |

The cheek audit uses 181 triangles per side on the original Face4 cheek area. Garment regions cover the upper stock neckline and high collar. Triangle overlap candidates are checked for a shared intersection segment. The audit samples the original Curls opacity in the hair triangle's UV space. Pair counts are dependent on mesh tessellation and help locate the contact severity. Visual review and the measured sweep show that the collar fit needs a separate clearance pass. Position, material, wardrobe and runtime changes remain outside this review.

## Repeat the private review

Use the saved private polished profile review blend, the local Vesper hero GLB and Gothic garage high-collar GLB, and the original Curls texture maps. The harness checks the rest-pose rig registration. It poses, renders and audits in memory, and writes private PNGs and a JSON report. Keep all asset derivatives and generated images out of the public repository.

~~~powershell
$blender = "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe"
$fit = "scripts/hair/fit"
$private = "C:/AvenskyPrivate/curly"
$atlas = "$private/CURLY SET/Hair Textures/Curls"

& $blender -b "$private/profile-review.blend" --python-exit-code 1 --python "$fit/review_curly_pose_clearance.py" -- --hero "$private/Vesper_CC_Hero_Textured.glb" --collar "$private/gothic-high-collar.garage.glb" --diffuse "$atlas/DIFFUSE_AUBURN.png" --opacity "$atlas/OPACITY.png" --normal "$atlas/NORMAL.png" --out-dir "$private/pose-review" --size 540 --samples 32 --threads 9
~~~

Use `--metrics-only` with a separate new directory to skip rendering. Use `--preview-only` to limit the run to the eight preview poses. All 48 local authoring tests passed, including the new shared-segment and UV-opacity tests.
