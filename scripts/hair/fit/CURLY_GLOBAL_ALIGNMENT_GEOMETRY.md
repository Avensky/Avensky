# Curly Mane: global geometric registration against original Vesper scalp

**Checkpoint:** 2026-11-25 · **Scope:** Vesper female only · **Status:** offline candidate with real source geometry and atlas, not Blender/engine-approved. No new cap, no source asset replacement, no merge/deployment.

## Root cause confirmed

The earlier "39-root" correction improved *nearest-skin* distances for whatever curl-card UV end was nearest the scalp. **That is not sufficient to identify an actual strand root when the whole hairstyle is too high.** We inadvertently risked selecting curl tips/lower ends instead of root attachments.

The actual `CURLY 01.FBX` has **253** connected curl-card components. Inspecting their geometry/UVs shows that **234/253** have their higher-Y end at the high-V texture boundary (this is a heuristic, NOT manually annotated root identity). **209** sufficiently long UV ribbons produced usable upper-end alignment candidates. Many upper ends were near source Y=184–189, versus the original Face4 scalp crown near Y=166.

**Required stage ordering:**
1. Import original Face4 + its real Face BaseColor + source Curly Mane with correct FBX transforms.
2. Identify likely *upper longitudinal* roots by UV V and physical direction, NOT the end nearest the head.
3. Fit the entire donor hair rigidly via limited **uniform scale + translation** to an author-approved sample of the **original skull surface**.
4. Review front/side/back/top; refuse local fitting if scale/units/roots aren't credible.
5. Only then annotate true roots, perform smooth low-displacement root-only corrections and add minimal interior clumps where opacity shows genuine holes.
6. Skin, export test GLB, check in-game and mobile; keep current bonnet/stock braids intact.

## Real geometry calibration, offline only

Source original FBX-space head coordinates are approximately centimeters, but vendor FBX UnitScaleFactor=2.54 vs Vesper=1.0, so final Blender world-scale conversion **has not been verified**. Do NOT copy raw translation numbers into Blender without checking units.

| Measurement | Before | Global candidate |
| --- | ---: | ---: |
| Uniform scale | 1.000 | **0.920** |
| XYZ translation (source units) | (0, 0, 0) | approximately **(-1.00, -21.65, -1.05)** |
| Likely attachment candidates used | 209 | 209 |
| Median candidate end → sampled original scalp distance (source units) | **19.62** | **1.40** |
| Candidate ends within 2 source units of sampled scalp | **0/209** | **166/209** |
| Connected curl components with altered relative geometry | 0 | **0** |

The root-centroid optimizer used the original **Face4 scalp-colored reference points**, a robust clipped nearest-point loss, a bounded translation, and a narrow scale interval of [0.92,1.08]. **The optimal scale reached the lower bound**. This is a REVIEW warning rather than evidence the true best physical scale is exactly 0.92. The original head geometry and Face BaseColor remain untouched; no curl-by-curl deformation was applied in this stage. Distances are nearest sampled vertices, **not validated signed collision/clearance**.

The corrected candidate's geometry bounds are approximately x[-16.5,14.5], Y[129.9,169.1], z[-16.0,12.5] in source coordinate units. This is compatible with a hairstyle that extends below the head, but only actual Blender/pose review can establish acceptable size.

## Real source diffuse and opacity visual review

The user supplied genuine **Curls** atlases (including `OPACITY.png`, `DIFFUSE_AUBURN.png` and additional maps). The private diagnostic renderer used the original Face4 UV/Face BaseColor and the actual Curly Mane quad UVs to sample the original **Curls diffuse and opacity**; a software alpha-composite simulated neutral lighting.

It shows:
- **Confirmed improved overall placement:** the bulk curls surround Vesper's head instead of floating high above it.
- **Still open:** large visible **crown and rear scalp** holes; some cards cross the face and obscure facial geometry; fringe/front hairline needs density/placement review.
- **Do not generate an opaque new scalp cap** to hide this. The source already has the natural scalp texture. Add controlled *interior-root clumps/wisps* only after classifying actual intended part lines.
- The software preview is NOT Blender's Eevee/Cycles PBR, exact alpha-ordering, or runtime mobile result. The original hair geometry and external UV/opacity atlases were used, but appearance and coverage require in-engine checks.

**Don't mix the second uploaded STRAIGHT atlas** (`OPACITY(1).png` and related variants) with Curly Mane's original source UVs. Only same-family Curls maps are suitable for this pilot.

## New pipeline components

- `coarse_scalp_alignment.py`: source-independent root-*candidate* upper-end extraction from real curl UV strips; robust, constrained global scale + translation solver. Never edits source hair.
- `test_coarse_scalp_alignment.py`: synthetic regression tests ensure upper roots aren't confused with lower/tip ends; verify shape preservation, misalignment recovery, fail-closed geometry inputs.
- `auto_align_curly_mane.py`: optional private Blender wrapper. Requires original textured Face4, artist-approved `AV_ScalpRegion` and confirmed world scale. Dry-run emits JSON receipt; `--write` creates a **new** .blend with a duplicated donor and candidate transform, **no local root deformation or GLB export**.
- **Legacy root conform in `pilot_curly_mane.py` is intentionally disabled** until a new root-only stage can use reviewed global placement; do not run the old `--mode conform` command.

Local synthetic math checks: **19 passed** (5 coarse global alignment + 8 previous similarity/root + 6 root-suggestion tests). Blender `bpy` integration and real phone tests **not run**. Source files and proprietary generated derivatives stay outside the public PR.

## Remaining geometry validation

- [ ] Verify actual import units and real head up axis in Blender; resolve donor 2.54 FBX unit metadata.
- [ ] Manually approve Face4 scalp vertex group using the original discoloration as a guide, avoiding ears and facial skin.
- [ ] Review 6 fixed views, including left profile and true three-quarter view (initial source comparison was 4 views).
- [ ] Review upper-UV-root candidates and resolve the scale-bound warning before committing a transform to an actual fitted asset.
- [ ] Classify scalp-visible holes by source alpha; identify genuine intended parts vs bald coverage gaps.
- [ ] Separate exterior curls from interior root cards; adjust only root sections or add a small number of low-cost under-clumps.
- [ ] Check facial occlusion, crown coverage, shoulder/collar clearance, head bone attachment, saved hairstyle state, alpha-overdraw and phone GPU.
- [ ] Do not merge PR #67 or deploy until explicit visual signoff.

## Source fidelity and privacy

Original privately supplied `SK_Village_Lady_Face4.fbx`, `CURLY 01.FBX`, `T_Villager_Lady_Face_BaseColor.tga` and Curls texture maps were used only for local numerical/PNG preview work. **No FBX, TGA, PNG, paid atlas, static GLB, or geometry arrays are committed to this public repository.** 
