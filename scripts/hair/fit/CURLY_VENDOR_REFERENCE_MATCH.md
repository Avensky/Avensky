# Curly Mane: matching the vendor's original two-angle appearance

**Checkpoint: 2026-11-25. Female Vesper only. Draft PR #67; no merge/deployment or GLB release.**

The user supplied a vendor preview titled **CURLY MANE — 55,800 tris**, showing an actual dark-brown curled bob from the front and side. This is a **style reference**, not a scale-calibrated 3D measurement or a substitute for the real donor FBX. The screenshot is kept private, not committed publicly. Source `CURLY 01.FBX` has 55,836 triangulated faces / 253 disconnected card sections; the counts strongly support that this is the correct source hairstyle family.

## Explicit visual targets, taken from the uploaded reference
- **Crown:** dense rounded overlapping/arched clumps that extend over the actual skull rather than leaving a large rear circular bald zone; do not paste a dark fake scalp cap.
- **Front:** irregular soft bangs/short wisps near forehead, generally **clear eyes, nose and mouth**. Some intentional texture-root discoloration can be visible through a natural part.
- **Sides:** well-defined 3D spiral ringlets in layered groups along the cheeks and jaw; the body has real volume, not flat sheets or an opaque helmet.
- **Rear silhouette:** textured overlapping coils, visible at side/back angle; retain crown expansion.
- **Length:** relatively compact layered bob, irregular ringlet tips around lower face/neck rather than excessive long untamed strands. The photo has no real-world units, so all numeric lengths are preview guesses until confirmed on Vesper.
- **Tone:** near-black/chocolate roots with warm copper highlights, not bright uniform orange. This is an aesthetic **style tint** for review only; source `DIFFUSE_AUBURN.png` must remain unmodified and the exact runtime shader must be evaluated later.

The original vendor image does **not** prove how to attach the roots to Vesper or where a part lies under the crown.

## Prototype experiments already performed locally (private, not shippable)
These were carried out on the previous **globally aligned** real `CURLY 01.FBX` card geometry, with the real Vesper Face4 texture + original donor Curls UV and `OPACITY.png`, NOT on an invented generative hairstyle:

1. **Small root clearance trial** on 90 of 253 connected sections, moving 8,458 vertices by at most **1.6 source-coordinate units** along approximate original scalp normals, tapered to protect curl lengths/tips. The 220-color-vertex scalp mask remains a numerical *proposal*, not a fully approved scalp-surface region.
2. **Rear crown card redistribution pilot:** six face-obscuring source cards (936 vertices) were *rotated rigidly around their candidate upper ends* toward six prototype positions at the rear crown; no new triangles, UV changes or destructive source edits. Manual visual quality and root provenance are **not** signed off, so these moves must not be applied automatically to the game.
3. **Length-only bob experiment:** lower hairs below Y≈153 (original source-coordinate system) were tapered upward, maximum ≈6.7 source-coordinate units. Root positions at or above the transition remain untouched. This is a **style comparison**, not an approved physical shrinkwrap; source-to-Blender units are not yet verified.
4. **Dark chocolate color-grade preview:** original diffuse luma + a warm-brown target tint, keeping source atlas/opacity/UV unchanged on disk. This is a software look-development approximation, not an authentic vendor PBR render.

**Observed:** the front bob silhouette is rounder and shorter, and a few face-crossing fragments were reduced. The rear/top scalp hole and remaining strands crossing the profile **are still plainly visible**. Therefore the root correction/redistribution is a **demonstration that the geometry controls are available**, not a convincing finished match to the vendor image.

A private PNG comparison board was created for direct chat viewing: vendor front/side, prior baseline, new trial front/right and rear. The user **cannot open GLB links**, so every review milestone must include direct PNG views with actual Face4 skin texture. Keep all private screenshots, source image, vendor files, `.blend`, `.npz`, and derivative GLBs out of public Git.

## Reusable safe helper functions
- `reference_shape_ops.py:trim_lower_tips` — smooth length taper that leaves crown/root coordinates unchanged
- `reference_shape_ops.py:rotate_card_about_root` — rigid Y-up card rearrangement using explicitly approved root and target points, preserving internal curl geometry
- `reference_shape_ops.py:root_clearance_shift` — bound-checks a clearance correction along a confirmed actual scalp normal and protects zero-weight tips
- `test_reference_shape_ops.py` — local tests of safety bounds, tip preservation, geometry shape and source immutability

**Do not call these functions an automatic reference-to-FBX fitter.** The vendor JPG does not include rig scale, root indices, or scalp UVs; automated part selection and exact collision/free-space evaluation remain open.

## Next required geometry gate
1. Freeze original Vesper neutral scene with correct Y-up FBX physical units vs Blender Z-up coordinates.
2. Approve the scalp surface based on the REAL Face4 BaseColor; remove fake root overlays/ear contamination.
3. Compare true rendered scalp surface coverage vs donor UV alpha and signed surface distances (not nearest sampled skin vertices); classify open back/crown as actual holes versus intentional part lines.
4. Mark WHICH source curls should fill the crown. Prefer reusing existing interior clumps without extra overdraw; generate minimal low-cost infill cards only if QA demonstrates need, with explicit approval.
5. Validate front/profile/back/top/three-quarter stills using original Curls color/opacity and later the Three.js/mobile shader. **Do not use image generation to imply a tested geometry result.**
6. Review animation, hair/head bone binding, outfit collars, mobile draw calls/transparency cost, source licensing and physical-phone rendering before applying to the running game.

**Release decision:** NOT APPROVED. Current Vesper hair/gameplay unchanged. Male hair and wardrobe deferred.
