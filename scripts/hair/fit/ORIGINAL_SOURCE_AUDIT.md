# Original Vesper female source audit — head, scalp, and hair (updated 2026-11-25)

**Source:** privately supplied original FBX meshes and hair textures. **Never commit the FBX, the source images, extracted polygons, or derived commercial outputs to this public repository.** This document records structural findings only; it is not a redistribution license or an approved scalp fit.

## Corrected fundamental finding
The ORIGINAL **Face4** mesh already includes the crown and full back of the skull. The game's comment that the face "stops at the hairline" is not a reliable description of these original source files; it may refer to a later modified/runtime version. Do **not** build Vesper's primary scalp using the old 32x14 hard-coded hemisphere, or using an invented landmark dome, when this exact head surface is available.

**Important later correction from the newly uploaded Face BaseColor:** the original Face4 surface **already carries a usable, natural-looking soft gray-brown scalp/follicle color fade**. The default solution is to keep this **existing textured head** under new volumetric hair. A selected thin source-derived scalp layer is **only an optional local correction** after the original surface has been tested against the new style. No new skull or global solid-color cap is needed.

## Source geometry summary

| Private asset | Geometry | Structural observations |
| --- | --- | --- |
| `SK_Village_Lady.fbx` | Combined character | Includes Face4, Hair20, body, bonnet and other meshes; standard named `head` bone |
| `SK_Village_Lady_Face4.fbx` | 6,330 vertices / 8,915 triangles | **Complete crown/back/side skull** in main Face material, not just facial features. Contains separate eye/facial material polygons and face shape keys |
| `SK_Village_Lady_Hair20.fbx` | 6,687 vertices / 7,303 triangles | Separate long hair/braid geometry, with many open card boundaries (5,468 single-face boundary edges; 301 open components); not a fully enclosed scalp cap |
| `SK_Village_Lady_Body.fbx` | Full character body+face+hair variant | Main BodyMesh ends at neck/head junction; separate Face4 carries skull surface |
| `SK_Village_Lady_Body(1).fbx` | BodyMesh only | Does not include a head scalp |
| `SK_Village_Lady_BodyMeshCut.fbx` | Cut body mesh | Not a source for scalp reconstruction |

Original FBX export uses Y as up, with FBX `UnitScaleFactor=1` (typically centimeters in FBX convention). Character heights and head bounds are consistent with centimeters; **confirm Blender import conversion and metric scale before any 1mm offset**. Do not apply an unverified 1.0-meters-per-unit constant to raw FBX coordinates.

## Texture findings
- `T_Villager_Lady_Hair_Black.tga` and `T_Villager_Lady_Hair_BlondeDark.tga` are 4096x4096 RGBA color/opacity atlases.
- `T_Villager_Lady_Hair_Normal.tga` is 4096x4096 RGB tangent normal atlas.
- `T_Villager_Lady_Hair_AmbientOcclusion.png` is 2048x2048 grayscale-like RGBA hair transparency/ambient map.
- `T_Villager_Lady_Hair_Roughness.png` is 2048x2048 roughness.
- `T_Villager_Lady_Hair_ID.png` and `T_Villager_Lady_Body_Hair_ID.png` are **byte-for-byte identical** (same file SHA256). They are material/zone data, **not geometric scalp mesh**.

Retain matching UVs and intended donor texture slots. Do not project the donor hair atlas directly onto scalp skin or use a general Hair ID texture as a geometric mask without inspecting UV layouts.

## The missing original texture was found — final source-color conclusion

The user supplied `T_Villager_Lady_Face_BaseColor.tga` on 2026-11-25. Together with original `SK_Village_Lady_Face4.fbx` and its UVs, this produced real-texture front/right/back/top head renders in the previous working conversation (not committed to this public repository). The mapped image shows Vesper's **actual skin tone plus fine gray-brown, short-hair/scalp speckling that fades into natural skin at the forehead/temples/nape**. In-game PBR lighting and separate eye materials can change the final appearance; compare with the actual game model before shipping.

**This is not the same as:**
- A uniform dark-brown sphere, generated debug scalp region, or synthetic hairline overlay.
- `T_Villager_Lady_Face_BaseColor_ID.tga` / `T_Villager_Lady_Body_BaseColor_ID.tga` material/recolor masks.
- Hair card diffuse/opacity atlases or roughness/normal maps.

Other uploaded original source materials include `T_Villager_Lady_Body_BaseColor.tga` (actual body) and `T_Villager_Lady_Details_BaseColor.tga` (eyes/details). **Use `Face_BaseColor.tga` for the real scalp appearance and keep the source Face4 UV mapping.** Do not confuse ID/recolor textures with basecolor source images again.

**Documented source-render correction:** Earlier conceptual gray/peach head sheets and solid brown scalp proposals were NOT valid texture-mapped source references. Only renders made using the original Face4 + true Face BaseColor should guide root drawings and silhouette fitting.

## Authoring direction (Vesper only)
1. Load original Face4 with its original Face BaseColor and verify neutral rig, UVs, imported units, head bone and current game GLB compatibility. Render six fixed views showing the *real scalp texture*.
2. Use that unmodified textured Face4 surface under a single real candidate hairstyle: start with Curly Mane and its OWN matching UVs/texture atlas.
3. Align donor roots to the real scalp. Protect curl mid-lengths and tips; no global shrinkwrap, no pseudo-volume card duplications.
4. If *actual* gaps remain, use a hand-reviewed local hairline pigment/wisp or underclump. `AV_ScalpRegion` + `extract_source_scalp.py` are optional diagnostics, not mandatory authoring and not visually approved.
5. Re-validate original braid/bonnet, high collars, head motion, phone GPU, alpha sorting and saved outfit/hair selection before publishing.
6. Document root edits, coverage zones, asset hashes, reference screenshots, unchanged source texture, acceptance measurements and remaining failures. Only then automate additional female hairstyles.

## Diagnostic limitations
Our early automatic proposal selected a plausible skull region but also highlighted some ear triangles and created jagged, triangle-stepped hairline edges. Therefore **do not ship an unreviewed curvature/height threshold mask**, and do not replace the actual Face BaseColor with a one-color debug layer. If supplemental coverage is necessary, review a local root zone on the textured head from front, sides, rear and top through head turns.

This source audit establishes that Face4 has real scalp geometry. It does **not** establish that the presently shipped derivative Vesper GLB has identical topology. Verify the live GLB before replacing any production code.

## Existing code to retain unchanged
- `villager-scalp-cap` in `frontend/src/game/characters/villagerModel.ts` remains a **bonnet-oriented fallback**.
- `scripts/hair/fit/build_scalp_cap.py` (landmark loft from prior milestone) is a fallback for a character that truly lacks a complete skull, not a Vesper source path. Likewise, `extract_source_scalp.py` uses a **debug matte material** and must NOT be mistaken for the correct original scalp texture.
- V1 material-only hair batch and the twelve accepted hairstyles remain unchanged.

## QA gate
**Female-only project pause:** male hair/clothing work has been deferred, with no schedule. See [FEMALE_HAIR_PROGRESS_AND_LESSONS.md](FEMALE_HAIR_PROGRESS_AND_LESSONS.md) and [AUTOMATION_READINESS.md](AUTOMATION_READINESS.md).

Private source and derived meshes must remain uncommitted. Do not merge the new scalp until actual Blender visual approval and rig, expression, color, GLB reimport and physical phone checks pass.
