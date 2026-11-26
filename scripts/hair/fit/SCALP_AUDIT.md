# Scalp baseline audit — Vesper (2026-11-24)

Status: **code-level findings confirmed; GLB geometry and in-app renders not yet inspected**. Do not treat a simple runtime sphere as a fitted scalp.

## Existing generated meshes in `frontend/src/game/characters/villagerModel.ts`
1. `villager-short-hair` (lines 173–185) is a `SphereGeometry` ellipsoid, added to the actor and attached to the head bone. It is visible only for the cropped hair mode, when hair is not tucked and no `scalpCap` exists (lines 298–302). It is recolored through `look.hair`.
2. `villager-scalp-cap` (lines 36–62) is a procedurally deformed hemisphere with 32 segments and 14 rows, placed with hard-coded coordinates/radii. It is attached to the `head` bone and recolored through `look.hair`. It is built only when `trialGarments?.scalpCap` is truthy (line 186).
3. `wardrobeGarmentFit.ts` sets `scalpCap` from the equipped hat garment's catalog flag (lines 510–512, 568–572); `packages/wardrobe-catalog/character-garments.json` sets `scalpCap: true` for `hood-07` (Medieval Hood 07 Down). Thus the cap does NOT automatically appear for every imported hairstyle.
4. The source comment says the face mesh stops at the hairline (lines 173–174). Inspect the actual skinned Vesper GLB before assuming the head contains top-of-skull triangles suitable for duplicating as a new cap.

## Imported hair rendering risk
`frontend/src/game/characters/fittedWardrobe/SpaceBunsPreview.tsx` lines 118–174:
- skips imported meshes with a material name ending in `Crown backing` (line 146);
- hides stock `HAIR_HAIR20` and `villager-short-hair` (lines 168–173);
- does not itself create the procedural `villager-scalp-cap`.
This combination can expose gaps when imported hair relies on its backing and the base head stops at the hairline. **Likely cause, but not proven for each asset until rendered.**

## First practical task (before authoring new geometry)
Create a diagnostic-only comparison on the same Vesper neutral pose and hairstyle:
A. Imported hair exactly as shipped today.
B. Imported hair with its original `Crown backing` retained (if present).
C. Imported hair plus a *debug* copy of the existing procedural `villager-scalp-cap`.
D. Scalp cap only, no outer hair, wireframe/front/back/side/top.

Do not ship a debug override that makes stock bonnet styles inherit a cap accidentally. Record which gaps remain, whether backing contains useful geometry, which caps intersect the forehead/ears, scalp color at hairline, and whether the cap stays attached through head turns. Ensure depth/Z-fighting and alpha overdraw are inspected.

## Proper scalp-cap build after this audit
- First check if the actual imported Vesper head includes a hidden top-of-skull mesh (this has **not** been verified). If so, duplicate that measured scalp region in the character bind pose.
- If the head genuinely ends at the hairline, **do not pretend to duplicate a nonexistent scalp surface**: trace the face/hairline boundary, identify crown/temple/ear/nape landmarks, construct a new closed, UV-mapped surface bridging this boundary with measured skull curvature, and validate normals and stand-off.
- Use a dedicated cap root-coverage material with the correct hair roots color/part mask; prevent visible plastic helmet edges and respect intentional parts.
- Fit/adapt root strips of imported curly clumps independently. Cap alone will not create missing volume.
- Mark the cap as a stable rigged component attached to the named head bone, not a free-standing world-space sphere.
- Re-enable source backing when appropriate instead of universally suppressing it; avoid double opaque shells and Z-fighting.
- Follow with photo QA from front/back/left/right/top plus head animation/collars/bonnets, then measured mobile LODs.

## What this audit does NOT establish
It cannot show whether the archived fitted `.blend` or any commercial vendor GLBs include separate scalp geometry; private binaries were not opened. Inspect mesh/material names and relevant coordinates directly in Blender before concluding that the originals had or lacked scalp caps.

References:
- https://github.com/Avensky/Avensky/blob/main/frontend/src/game/characters/villagerModel.ts#L36-L62
- https://github.com/Avensky/Avensky/blob/main/frontend/src/game/characters/villagerModel.ts#L173-L186
- https://github.com/Avensky/Avensky/blob/main/frontend/src/game/characters/villagerModel.ts#L283-L302
- https://github.com/Avensky/Avensky/blob/main/frontend/src/game/characters/wardrobeGarmentFit.ts#L568-L572
- https://github.com/Avensky/Avensky/blob/main/frontend/src/game/characters/fittedWardrobe/SpaceBunsPreview.tsx#L118-L174
- https://github.com/Avensky/Avensky/blob/main/packages/wardrobe-catalog/character-garments.json
