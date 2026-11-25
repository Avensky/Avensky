# Real CURLY 01.FBX → Vesper source audit (2026-11-25)

Scope: female Vesper only. The actual user-uploaded Curly Mane binary was analyzed offline. **Nothing is merged or deployed. No paid source asset is committed.**

## Confirmed input
- Real Curly Mane: **42,685 vertices, 27,918 quads (55,836 triangles), 253 disconnected curl sections**.
- Donor's raw mesh height uses Z, but the FBX has PreRotation -90° around X and matching geometric/local translations; their combined transform maps raw XYZ to Vesper-style **(X, Z, -Y)**. The donor metadata reports UnitScaleFactor=2.54 whereas Vesper Face4 reports 1.0; **verify actual import units in Blender**.
- Real head: original Face4 geometry and T_Villager_Lady_Face_BaseColor.tga on original UVs. The real gray-brown scalp markings remain intact; no synthetic bonnet/cap.
- Actual CURLY 01.FBX contains no material/atlas objects. Without its original Curls diffuse and opacity maps, only a geometry-only preview is possible.

## First source geometry preview
A private four-angle diagnostic was created using Face4's actual skin texture and Curly Mane's node-transformed cards. Hair was rendered as *translucent taupe diagnostic geometry*, **not as a realistic original hair material**. There is substantial exterior volume, but source scalp shows through near the forehead, parts of crown, and nape. This may change after alpha-cutout maps are applied, and it is not a visually approved final fit.

## Conservative scalp-contact trial
- An approximate real-texture scalp mask (220 candidate Face4 vertices) was derived from Face BaseColor samples, **not a reviewed production scalp selection**.
- UV-end root candidates were checked per disconnected curl; do **not** assume every outer card should touch the scalp.
- **39 of 253 sections** accepted provisional near-root adjustments, **819 of 42,685 vertices** moved, maximum displacement 2 cm in apparent source-coordinate units, zero-weight tips unchanged.
- Median root-center-to-candidate-scalp-vertex distance for those 39 sections changed from **1.812 cm to 0.15 cm**. This is a nearest-vertex diagnostic proxy, **not** a verified nearest-surface clearance or finished hair appearance.
- **214 sections left unchanged** pending interior/outer classification.
- A **private static GLB** and source preview were produced in the conversation. The GLB has original Face BaseColor on Face4 and a *placeholder hair material*, no animation or Vesper skin weights, and is not a game asset. Structural GLB reimport succeeded.

## Code / verification
- Existing fit_math.py and test_fit_math.py cover similarity transforms and zero-weight-tip preservation.
- New root_suggestions.py and test_root_suggestions.py issue fail-closed suggested root bands with ambiguous/far roots left unapproved.
- **14 local synthetic mathematical tests passed** (8 fitting + 6 root suggestions). The Blender authoring scripts have not yet been executed against the real donor in Blender.
- No source FBX, proprietary maps, preview GLB, private root-coordinates or meshes have been committed to the public repository.

## Next actions (Vesper only)
1. Review geometry silhouette and exposed scalp on Vesper from front/side/back/top; do not start any new cap.
2. Load the genuine Curls color/diffuse **and OPACITY** atlas; evaluate real strand cutouts before painting missing hair.
3. Confirm Blender's imported donor axis/units from FBX model nodes and save a private neutral reference scene.
4. Approve true interior roots vs distant exterior cards; conform root strips only, preserving outer curl shapes.
5. Fill only verified uncovered root-density zones using a few inner curls/wisps; test head turns, collars and bonnet.
6. Skin, reimport, run alpha and phone performance QA, then create LODs and only deploy after explicit review.

**Stop conditions:** do not merge PR #67, globally replace Vesper's scalp, shrinkwrap complete curls, or introduce male wardrobe work.
