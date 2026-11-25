# Female hair automation — actual readiness and definition of done

**Checkpoint:** 2026-11-25 | **Target:** Vesper ONLY | **Male hair/clothing:** paused, not scheduled.

## Short answer

**We have the source evidence and a partial automation scaffold; a one-command end-to-end hair fitter does not yet exist.** Do not quote a completion percentage based on research, scripts being committed, or attractive reference renders. The **largest missing engineering step** is mapping a new hairstyle's root/card geometry onto Vesper's head without flattening the rest of the hairstyle.

### Evidence-based status

| Capability | Current status | Evidence / next gate |
| --- | --- | --- |
| Identify original head + bones | **Source confirmed / inspector scripted** | Face4 FBX full skull verified; `inspect_character.py` exists; runtime derivative/Blender bind-pose check pending |
| Recover the real scalp/skin color | **Confirmed / reference produced** | `T_Villager_Lady_Face_BaseColor.tga` used on source Face4 UVs for front/right/back/top views; preserve this rather than synthesizing a solid-color cap |
| Catalog and material-only batch | **Existing, partial** | Earlier twelve-style material processing can prepare materials; it does not add volume or alter geometric root fit |
| Separate corrective scalp layer | **Optional prototype only** | `extract_source_scalp.py` writes a private debug-material working copy if manually annotated; **not default and not visually approved** |
| Donor source inventory | **Scripted / direct mesh unavailable this turn** | Original CURLY 01.FBX supplied and analyzed; correct FBX node axis transforms identified, but Blender import unit conversion and original Curls opacity/materials remain unverified |
| Establish reusable Vesper head coordinates | **Not finalized** | Neutral actor + real source BaseColor + rig/bone/unit frame + reference cameras need a saved, approved private scene |
| Automatically find/assign source hair roots | **Not implemented** | Need explicit or confirmed root zones per imported mesh/card; output confidence and manual fallback |
| Coarse source→Vesper alignment | **Math + guarded Blender pilot implemented; real donor untested** | `fit_math.py` uses reflection-free Kabsch/Umeyama similarity; `pilot_curly_mane.py` requires five paired source/target markers and real Face BaseColor |
| Controlled root-only conformance | **Initial prototype scripted; real donor untested** | Connected-clump displacement respects root weight fade and zero-weight tips; projects only onto author-approved Face4 scalp faces and rejects excessive shifts. Needs actual root groups, Blender run and visual QA |
| Genuine density/volume correction | **Not implemented** | Need detected uncovered non-part areas and limited inner clump/wisp authoring; do not blindly duplicate cards |
| Automated six-view/pose QA | **Not implemented** | Need reproducible front/back/left/right/top/three-quarter captures, cap isolation, head turns/collar/bonnet checks |
| Mobile optimization and GLB export | **Not implemented for V2** | LOD generator, deterministic export, reimport, mesh/material validation and physical-phone GPU QA |
| In-game discovery/integration | **Existing runtime catalog mechanism; V2 unintegrated** | Add approved private manifest entry to existing catalog only after real fit, not a new manual UI list |

**The Vesper pilot isn't finished.** No success is claimed for a new fitted Curly Mane GLB, an authored original-texture root overlay, or a validated phone LOD.

## Curly Mane actual-source update (2026-11-25)

Real CURLY 01.FBX is now available and has been inspected: **253 separate curl components**. A static Vesper comparison and conservative offline UV-root trial adjusted **39 sections / 819 vertices**, maximum 2 cm; 214 sections remain unchanged. The genuine Curls color/opacity maps and Blender, animation, mobile and GLB output validation remain outstanding. See [CURLY_01_REAL_MESH_AUDIT.md](CURLY_01_REAL_MESH_AUDIT.md). A separate [root_suggestions.py](root_suggestions.py) proposes roots without modifying meshes; 6 new synthetic tests pass alongside the prior 8 math tests.

## Current Curly Mane pilot code

See [CURLY_MANE_PILOT.md](CURLY_MANE_PILOT.md). `prepare_curly_mane_workbench.py` imports the true Face4 BaseColor and original CURLY 01.FBX into a new private workbench; `pilot_curly_mane.py` supports inspect/align/conform with no source overwrite; `fit_math.py` preserves unmarked curls. **Eight local synthetic tests pass.** Neither Blender nor the actual Curly Mane FBX was executed during this session, so automation is **not yet validated on the real hairstyle**.

## Automation milestones — ordered dependency gates

### Gate A — one-time character calibration (HIGHEST PRIORITY)
- [x] Confirm original Face4 contains crown/back/side geometry.
- [x] Obtain and examine original `T_Villager_Lady_Face_BaseColor.tga` scalp colors and UV render.
- [x] Retain stock `Hair20` and bonnet independently of fitting candidates.
- [ ] Recreate/save the true-textured neutral Vesper Blender scene using source FBX **with original face BaseColor** and original rig.
- [ ] Verify scene units and Y-up FBX import conversion; record the *actual* head bone and face mesh object names.
- [ ] Save locked 6-angle baseline renders/camera positions (front, back, left, right, top, 3/4) with fixed exposure.
- [ ] Record landmarks (forehead hairline, temples, crown, ears, nape) in head-bone local units.
- [ ] Compare that scene to the current game GLB; confirm no missing Face4 scalp triangles or mismatched UVs.

**Definition of done:** reimporting the source produces the same head and original scalp color without manual shader reconstruction; complete reproducibility report includes hash, Blender version, material names, and all viewpoints.

### Gate B — one Curly Mane geometry fit
- [x] Inspect original CURLY 01.FBX topology, UVs and node transforms; [ ] confirm Blender import units and provide its matching Curls diffuse/opacity maps.
- [ ] Mark root strips or confirmed root vertex weights on a **working copy**, never vendor originals.
- [x] Implement/test reflection-free similarity alignment (synthetic tests passed); [ ] measure and confirm 5 real source↔Vesper marker pairs in Blender.
- [x] Write root-only connected-clump projection with a safety bound against the source Face4 scalp (synthetic tests passed); [ ] run and visually validate it on real Curly Mane FBX.
- [ ] Produce before/after landmark errors, penetration measurements, silhouette comparisons and visible gap map.
- [ ] Validate front/back/side/top and emote/head turns, especially forehead, part, ears, crown, nape and high collars.
- [ ] Manually approve the prototype as **one acceptable signature curly hairstyle**.

**Definition of done:** same command produces the same privately saved Vesper-fitting Curly Mane .blend and reproducible screenshots; natural silhouette preserved; no full-mesh shrinkwrap or fabricated scalp color.

### Gate C — reusable and safe batch fitting
- [ ] Introduce per-style declarative root/part configuration (names, landmarks, protected geometry, atlas, dyes).
- [ ] Run fit, diagnostics and QA on a SECOND stylistically different Vesper hairstyle without editing the core fitter.
- [ ] Preserve hairstyle-specific backing when beneficial; never unconditionally strip `Crown backing`.
- [ ] Support author review for intentionally exposed parts, difficult headwear, incomplete donor UVs.
- [ ] Record source hash, output hash and which steps were automatic/manual; fail closed on uncertain assets.

**Definition of done:** at least two distinct styles reprocess deterministically from configuration, with no bespoke code patch per hairstyle.

### Gate D — optimized and shippable
- [ ] Export validated LOD0 garage, LOD1 gameplay/phone, LOD2 distant silhouette GLBs.
- [ ] Verify retained head bone binding, UVs, alpha, normals, materials, skin tone, animations and no texture leakage.
- [ ] Run representative real phone tests for render performance, memory, transparent overdraw and frame stability.
- [ ] Add accepted assets into the private fitted-hair manifest; confirm outfit save/reload and no UI/camera regression.
- [ ] Verify redistribution rights before making third-party derivatives public.
- [ ] Merge/deploy **only after manual approval**.

**Definition of done:** a new accepted hairstyle can be fitted, validated, exported, cataloged and tested with minimal human authoring after one character-calibration setup.

## Honest effort assessment

This is **past discovery, before validated automation**. The Vesper texture/geometry investigation is done; preparation scripts, alignment/root-deformation algorithms and synthetic tests are now written, but root markers/groups have not been measured on the actual donor, and there is no validated Blender Curly Mane result or automated render QA/export. The next hard proof is a **single successfully fitted and reimported Curly Mane**. Do not promise a calendar date, extrapolate a fixed time-per-style, or call the workflow "one-click" before Gate C passes.

## Resource-saving guardrails

- Never do a texture/material polish pass before the actual head/UV/roots have been shown working on Vesper.
- Never start a new hair pack because a scalp-color mismatch wasn't diagnosed on the original head.
- Reuse one neutral scene, one calibrated head frame, one fixed camera matrix, one source asset inventory and one QA receipt.
- Keep manual fixes as measured, replayable parameters/config values, not unexplained vertex edits.
- Use the existing scalp discoloration as the visual reference. Only supplement where uncovered roots are *actually* an issue.
- Keep selected original hairstyle and bonnet behavior stable while fitting imports separately.
- **Stop all new male wardrobe/hair work.** No other characters required to call the Vesper pilot complete.

## Resume commands / developer pointers

Read [FEMALE_HAIR_PROGRESS_AND_LESSONS.md](FEMALE_HAIR_PROGRESS_AND_LESSONS.md) and [ORIGINAL_SOURCE_AUDIT.md](ORIGINAL_SOURCE_AUDIT.md) first.

Current files: `inspect_character.py`, `inspect_source.py`, `extract_source_scalp.py` (optional diagnostic), `build_scalp_cap.py` (not for Vesper by default), `cap_geometry.py` (fallback math), `styles/curly_mane.json`, `character_profiles/vesper.json`.

The planned `fit_hair.py` / `validate_fit.py` / `render_qa.py` commands in older specifications are **not implemented**, and must not be presented as functional. Focus on Gate A and Gate B.

## Pause record
Female character hair only. Existing artifacts remain on draft PR #67; **no merge, production change, or staging deployment**. This page is the roadmap for resuming without reconstructing what we learned.
