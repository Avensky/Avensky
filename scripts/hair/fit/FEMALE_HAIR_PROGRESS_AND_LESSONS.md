# Vesper female hair — progress, decisions, and lessons learned

**Checkpoint:** 2026-11-25 | **Branch:** `hair/scalp-fit-pipeline-v2` | **Draft:** PR #67  
**Scope freeze:** Vesper / original Village Lady female character and female hair only. **Male hair, male clothing and additional character models are explicitly out of scope and deferred without a date.** No male placeholders or parallel tracks required.

This file is the handoff/resume record. Read it **before starting any further hair experiment** so the same mistakes are not repeated. Everything called "verified" below is source inspection or the previously produced reference; it is **not** a claim that the new V2 pipeline passed an in-engine visual test.

## Where we actually stopped

### Confirmed from original source assets / reference renders
- **Original complete head exists:** `SK_Village_Lady_Face4.fbx` includes crown, sides, and back of the skull, not just a face fragment. Source audit recorded 6,330 vertices and 8,915 triangles for Face4.
- **Original scalp COLOR exists:** `T_Villager_Lady_Face_BaseColor.tga` was supplied later. When mapped to the original Face4 UVs, it shows real face/skin tones and a **soft gray-brown, fine speckled short-hair/scalp discoloration fading at the hairline, temples and nape**. THIS is the authoritative root appearance and human reference, not our proposed brown overlay.
- The original `T_Villager_Lady_Face_BaseColor_ID.tga` and `T_Villager_Lady_Body_BaseColor_ID.tga` are **material recolor/ID masks**, not substitutes for the actual Face BaseColor texture. `T_Villager_Lady_Body_BaseColor.tga` supplies actual body color. `T_Villager_Lady_Details_BaseColor.tga` supplies detail textures.
- The original `SK_Village_Lady_Hair20.fbx` is a separate stock hairstyle (6,687 vertices / 7,303 triangles; structural audit found 301 disconnected open components). It is **not** a watertight scalp cap. The stock braid/bonnet and existing gameplay behavior are preserved.
- Original hair diffuse/alpha, normal, roughness, AO, and hair-ID atlases were inspected; `T_Villager_Lady_Hair_ID.png` and `T_Villager_Lady_Body_Hair_ID.png` were byte-identical in the earlier source audit.
- True-texture **front, right, back, and top** reference views were produced from original Face4 UVs + original Face BaseColor in the earlier working conversation. Those were a *source-texture reference*, with simplified lighting and some simplified eye/eyelash materials. They do not automatically imply current runtime GLB matches the source.
- The installed 12 fitted hairstyles are provisionally accepted for the alpha direction, but earlier material-batch work primarily improved texture maps without changing their fundamentally flat/open geometry. Do not silently revoke that approval or overwrite them.

### Code that exists, but is NOT yet a proven end-to-end fitting pipeline
- `inspect_character.py` and `inspect_source.py`: source inventory and warnings, written but require execution on the actual Blender inputs.
- `extract_source_scalp.py`: **optional** author-approved root-region extraction from Face4; dry-run by default, makes a new .blend when opted in. Uses a *new matte debug material*, **not the original Face BaseColor**. This is a diagnostic or supplemental layer only and should **NOT** be run routinely or replace the existing head skin. No approved `AV_ScalpRegion` or final Face4 extraction is recorded.
- `cap_geometry.py` / `build_scalp_cap.py`: synthetically loft a cap; **fallback for a character without a complete head only**. Not the route for Vesper now that the original geometry is known. Seven pure-Python synthetic geometry tests were reported passing earlier; not a Vesper Blender acceptance test.
- `hairScalpAudit.mjs` and diagnostic preview switches: source crown-backing vs bonnet-era sphere comparisons; not a permanent fix, and not a replacement for the source texture.
- `run-scalp.ps1`: Windows launcher meant to locate Blender without PATH; the user's machine has not yet verified it.
- `styles/curly_mane.json`: proposal/config with **missing root landmarks, unverified source units, and unverified source rig attachment**; a JSON file alone does not fit a mesh.
- **Not built:** automated donor root landmark mapping, similarity fit, protected root-only retarget, volume/gap repairs, camera matrix QA generation, LOD reduction, validated GLB exporter, physical-phone performance gate.

## Critical distinctions (never confuse again)

| Layer | Definition | Vesper choice |
| --- | --- | --- |
| **Source head/scalp** | Real skin mesh, UVs, skin material, and original follicle/short-hair coloration | Preserve **Face4 + original Face BaseColor** |
| **Supplemental root coverage** | Optional separate texture overlay, hairline wisps, or selected source-derived thin surface if an actual gap needs it | **Do NOT generate by default**; add only after a real problem is measured |
| **Hairstyle volume** | Imported cards/clumps/curves physically occupying space above the skull | Fit root region; keep curl/clump body and recognizable silhouette |
| **Bonnet-era cap** | Hard-coded procedural sphere-like geometry for legacy hood/bonnet behavior | Leave stock behavior alone; do not universalize it |

## Trial-and-error — what happened and the rule it taught us

| Experiment/observation | Why it did not settle the problem | Permanent rule |
| --- | --- | --- |
| Kept recoloring, re-atlasing, and improving normals on the twelve thin styles | Materials cannot create physical thickness or cover holes caused by sparse geometry | **Inspect geometry and root density before material polishing** |
| Tried a sphere/hemisphere cap to match hair color | Approximate bonnet dimensions do not necessarily match the full real skull or hairstyle part | **Inspect the original source head before generating anything** |
| Threshold-selected a brown scalp cover from mesh coordinates | Incorrectly grabbed ear triangles and produced angular/jagged forehead edges | **No unreviewed procedural color/cap masks** |
| Hid imported `Crown backing` unconditionally | Can strip an imported style's own root coverage and expose sparse parts | **Inspect each style's true backing first; keep it when useful** |
| Interpreted ID/recolor masks and flat brown renders as original scalp appearance | A material ID or synthetic paint is not a Face BaseColor texture | **Never label a mock-up as a source render; require original Face BaseColor** |
| Rendered the head in gray or generic peach without original UV texture | Looked different from Vesper's own existing hair-root discoloration | **Render from actual FBX+UV+BaseColor for fitting decisions** |
| Considered replacing all twelve styles at once | Makes it impossible to distinguish geometry, atlas, UV, and shader regressions | **Pilot on one representative real style first** |
| Considered projecting entire donor hairstyle onto a cap | Whole-mesh shrinkwrap flattens curls, changes silhouettes and tangles cards | **Only root regions may conform; preserve lengths and tips** |
| Tried mixing donor curl opacity atlas with unrelated flat-card UVs | Cutouts do not correspond to the unrelated UV islands | **Preserve matching donor UV/atlas until re-atlased deliberately** |
| Had Blender command-not-found and source unit ambiguity | Cost time without producing a reliable authoring pass | **Use the Windows launcher and confirm FBX units/orientation explicitly** |
| Focused on pretty renders instead of in-app/phone validation | Misses alpha sorting, halos, head movement, clothing, and LOD cost | **Render matrix and target-phone acceptance are separate hard gates** |

## Canonical Vesper workflow (source-first)

1. **Freeze source:** retain hashes, exact original Face4 FBX and `T_Villager_Lady_Face_BaseColor.tga`. Make an untouched copy of the stock braid/bonnet and all twelve accepted styles.
2. **Load the real head:** map the actual original Face BaseColor to the original Face4 UVs and rig. Inspect against the canonical neutral pose in the private Blender scene. Do **not** recolor the scalp brown.
3. **Use the existing natural scalp/root discoloration:** the head itself is the root foundation. Only if a specific hairstyle reveals a measurable gap, author a small supplemental paint/wisps/underclump rather than invent a full-head cap.
4. **Pilot on Curly Mane** (`CURLY 01.FBX`, original matching Curls UV/atlas): verify axes/units, mark donor root sections, solve rigid similarity transform, move roots with a tapered influence while protecting the curl mass. Never reshape the full hairstyle globally.
5. **Fill genuine density holes:** preserve intentional part lines and scalp show-through; add minimal inner volume only to isolated bald gaps after front/right/back/left/top and three-quarter reviews.
6. **Validate animation and materials:** neutral, head turns, emotes, high collars, bonnet/hood compatibility, skin tones, hair palette shades, alpha cutout and engine lighting.
7. **Then automate LOD/export:** only after the single Curly Mane pilot passes visually, export garage/phone/distant LODs and register the style in the existing private hair catalog without editing a second UI list.

This order matters. A plausible reference render or successful Blender script run **does not** demonstrate a fitted style or prove production readiness.

## Next concrete checkpoint for the female character

The first high-value repeatable artifact is a **private neutral Vesper scene** with correct original Face4 geometry, source Face BaseColor, actor skeleton, deterministic 6-view cameras, and a documented coordinate frame. Once that is saved and verified, the same character calibration can be reused for every incoming female hairstyle.

After that, fit **Curly Mane once**, compare before/after root distances and silhouette, and retain source screenshots. Only then optimize the procedure for batch processing.

## Acceptance / stop conditions

- Do not merge PR #67 or deploy a replacement scalp/head.
- Stop fitting if original BaseColor, actual Vesper head, donor atlas, root landmark metadata or correct units are absent.
- Accept only when real 3D views show an original-looking curl silhouette and no unintended bald spots or fake helmet boundary; confirm head movement and target phone cost before shipping.
- Preserve existing stock braid/bonnet. Remove diagnostic URL flags before production if no longer needed.
- Paid/source FBX, blend working copies and derived commercial textures/GLBs must remain private until licensing/redistribution rights are resolved.

## Leave-behind for a long break

**Resume by reading this file and [AUTOMATION_READINESS.md](AUTOMATION_READINESS.md), not by starting new hair material experiments.** Vesper-only scope remains. No male-hair tasks or placeholders should be created as follow-up work. The pipeline is intentionally paused at a recorded state, not abandoned.
