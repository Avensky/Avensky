# Avensky alpha — asset readiness register

Updated 2026-11-24. This is an approval/integration tracker, **not** a statement that every listed asset is released or even installed in the new repository. This tracker belongs to the Avensky game repo and does not imply that previously approved AvenLab assets have been validated here.

## Status definitions
- **Approved**: user accepted the asset's appearance for alpha; individual compatibility issues can still block a combination.
- **Provisional**: usable for the alpha direction; named visual or device verification remains.
- **Candidate**: source inspected but not yet integrated or approved.
- **Release gate**: gameplay/render integration, tests, licensing and target-device checks completed.

| Asset | Appearance approval | Current evidence | Release gate |
| --- | --- | --- | --- |
| Vesper Vega (hero) | Existing default hero | Desktop/portrait LODs and 88-joint rig exist | Verify shipped Vesper assets in Avensky, physical-phone behavior, and animations |
| Rook Okafor (starter) | Existing second starter | Existing roster entry | Verify packaging and game appearance |
| Pack 7 Tops 01–05 | Approved for alpha | Approved in wardrobe history; merged fixes in AvenLab | Validate installed asset files in Avensky, underarm poses |
| Corsets 01–05 | Approved for alpha | Approved as standalone clothing; Ruffled Corset 03 further accepted after smoothing | Verify installed files and skirt combinations; standalone Gothic Underbust remains distinct from retired full outfit |
| Regular Skirts 01–04 | Provisional / passable | Most recent fitting and shading revisions merged in AvenLab | 27 contact failures across nine skirt/corset combinations, worst 7.7 mm; final rendering |
| Gothic Skirts 01–05 | Provisional / nearly passing | PR #35 geometry tests report no Gothic pairing failures | Final fold/cloth/waist visual QA on device |
| Socks 01–04 | Provisional pass | Alpha category graded Pass in wardrobe | In-game look and save/restore |
| Belted tunic (`medieval-06`) | Provisional pass | User accepted the fit. The leather utility belt and pouch have a saved color. | Verify belt color and reload on a physical phone. |
| Linen nightgown (`linen-nightgown`) | Provisional pass for Sleepwear | User accepted the fit. Both model tiers passed the hem and thigh checks in sampled idle, walk, hop and sit poses. | Verify animation and outfit restore on a physical phone. |
| Underwear and bras | Integrated functionality, not independent final sign-off | V-cut/boxer briefs and classic/pushup bra controls merged in AvenLab | Verify skin clipping, colors, saves on phone |
| Repaired 12-style hair pack | **Provisional appearance pass** | 12 fitted hair meshes; UVs reconstructed; Style 12 exported as a Vesper GLB with strand maps | **In-game color + highlight + roots**, save/reload, caps, hat rules, mobile cost |
| CC-character detailed hairstyle | Textured fit proof, not final alpha pass | Fitted to Vesper; 13 controls and six material groups; 64,984 triangles | Mobile LODs, hairline, clothing contact and animation |
| Curly 01 Mane | Candidate | FBX geometry + UVs + Curls 2K atlas verified | Fit to Vesper, performance LODs, license restrictions, mobile QA |
| Curly 02 Ponytail | Candidate | FBX geometry + UVs + texture atlases verified | Fit to Vesper, rigging, movement, color QA |
| Curly 03 Punk | Candidate | FBX geometry + UVs + texture atlases verified | Fit to Vesper, rigging, movement, color QA |
| Pose collection | Preview-capable draft, not merged alpha-ready | Draft PR #37 reports 117 community poses + four native poses | In-app render, fingers, props, skirt levels, clothing |
| Vehicles | Existing game vehicles; ungraded as complete set | BRZ/AE86 material/LOD performance instrumentation in draft PR #36 | Interaction, damage/respawn, controls, multiplayer/device QA |
| World/maps | In development | City renderer audit draft PR #38 | At least one fully playable map + device performance and multiplayer QA |

## Known boundaries
- Hair cards can use a material inspired by the curly set's *mapping strategy*, but cannot drop the new Curls opacity atlas onto unrelated UVs without repacking/remapping.
- No purchased third-party source FBX or textures are to be committed to a public repository without verifying redistribution rights. Store private source inputs outside the public repo; commit transform scripts, manifests, generated assets only if the license allows their distribution.
- The earlier 12-style pack's exported FBX had invalid UVs on ten of twelve styles. Preserve source UVs and the corrected secondary UVs; never claim to have restored original UVs.
- An accepted standalone garment does not imply all corset/skirt pairings have passed.

## Current Avensky runtime integration gap

Natural and Close crop remain the base options. The twelve Espresso fitted styles are exported and cataloged for private staging. The Body editor lists the styles enabled in the asset release. The three curly candidates still require fitting. [Private staging installation](../CLOUD_ASSETS.md#fitted-vesper-hairstyles)

## Immediate acceptance matrix
1. Hair Style 12 on Vesper: dark brunette / ash / blonde / caramel balayage in garage lighting, sun and shade, and after reload.
2. Compare hair from front/side/back, with different collars, hood and headset/cap; scalp coverage, shadow fringes, card sorting.
3. Verify hair material under both desktop and mobile LODs, look for white alpha halos and transparent overdraw.
4. Try curly mane as the target look: espresso roots, warm caramel highlights, controlled curl frizz. Optimize the 55,836-triangle source for mobile.
5. Review remaining nine regular-skirt/corset collision cases rather than regrading approved individual items.

## References
- AvenLab PR #35: https://github.com/Avensky/AvenLab/pull/35
- AvenLab PR #36: https://github.com/Avensky/AvenLab/pull/36
- AvenLab PR #37: https://github.com/Avensky/AvenLab/pull/37
- AvenLab PR #38: https://github.com/Avensky/AvenLab/pull/38
