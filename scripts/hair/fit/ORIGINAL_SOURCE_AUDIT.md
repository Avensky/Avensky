# Source FBX audit — original Village Lady files (2026-11-24)

**Source:** privately supplied original FBX meshes and hair textures. **Never commit the FBX, the source images, extracted polygons, or derived commercial outputs to this public repository.** This document records structural findings only; it is not a redistribution license or an approved scalp fit.

## Corrected fundamental finding
The ORIGINAL **Face4** mesh already includes the crown and full back of the skull. The game's comment that the face "stops at the hairline" is not a reliable description of these original source files; it may refer to a later modified/runtime version. Do **not** build Vesper's primary scalp using the old 32x14 hard-coded hemisphere, or using an invented landmark dome, when this exact head surface is available.

The right solution is **a thin, head-surface-derived scalp/root covering, with a carefully authored hairline region**, then a separate layer of volumetric clumps/cards that come out of the roots. The existing scalp skin is already under the hair; a new physical skull is unnecessary.

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

## Authoring direction
1. Inspect and identify `Face4` **main Face skin material**, excluding eyes, lashes, cornea and ears from the scalp region.
2. On a PRIVATE neutral pose .blend derived from the original Face4 FBX, create `AV_ScalpRegion` vertex group on the upper skull, including crown, temples, rear and nape, but never eyebrows, forehead skin below hairline, ears or face.
3. Use `extract_source_scalp.py` for a read-only face/vertex/rig/UV preflight, then generate a **NEW** prototype .blend (source Face4 stays untouched). This copies original skull triangles, UVs and armature binding and adds a matte root material on a thin offset layer.
4. Improve root line through a tapered follicle/density texture and transition wisps; avoid a hard dark polygon edge or duplicate skin z-fighting.
5. Align each hairstyle's source **root strips** to this same measured skull using landmarks. Preserve its outer silhouette and individual curl volume. A good cap alone cannot fill missing internal clumps.
6. Re-validate original stock braid/bonnet, high collars and all imported hair in garage and mobile.

## Diagnostic limitations
Our early automatic proposal selected a plausible skull region but also highlighted some ear triangles and created jagged, triangle-stepped hairline edges. Therefore **do not ship an unreviewed curvature/height threshold mask**. Author the one-time scalp vertex-group mask, then view it from front, sides, rear, above and through head turns.

This source audit establishes that Face4 has real scalp geometry. It does **not** establish that the presently shipped derivative Vesper GLB has identical topology. Verify the live GLB before replacing any production code.

## Existing code to retain unchanged
- `villager-scalp-cap` in `frontend/src/game/characters/villagerModel.ts` remains a **bonnet-oriented fallback**.
- `scripts/hair/fit/build_scalp_cap.py` (landmark loft from prior milestone) should be considered a **fallback for future characters that truly lack a complete skull**, not the primary Vesper source path.
- V1 material-only hair batch and the twelve accepted hairstyles remain unchanged.

## QA gate
Private source and derived meshes must remain uncommitted. Do not merge the new scalp until actual Blender visual approval and rig, expression, color, GLB reimport and physical phone checks pass.
