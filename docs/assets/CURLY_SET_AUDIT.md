# Curly hair set — source inspection / reuse assessment

Archive: `CURLY HAIR SET.zip` provided by the user. Examined directly on 2026-11-18. Contains exactly **3 binary FBX meshes** and **43 PNG images** (plus folder entries). No bundled license text was found. Treat as third-party commercial source material until rights are established.

## Mesh geometry (raw binary FBX topology)

| Mesh | FBX model name | Vertices | Triangulated face count* | UV coordinate entries | Unique UVs (rounded to 5 places) | Approx. coordinate bounds |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| CURLY 01.FBX | Curly_Mane | 42,685 | 55,836 | 38,471 | 37,947 | x -17.06 to 16.65; y -14.79 to 16.11; z 148.73 to 191.28 |
| CURLY 02.FBX | CurlyPonytail | 28,182 | 36,788 | 13,326 | 2,175 | x -15.08 to 13.66; y -10.36 to 19.49; z 165.19 to 197.58 |
| CURLY 03.FBX | CurlyPunk | 20,549 | 25,496 | 2,312 | 1,358 | x -12.65 to 8.18; y -12.43 to 13.27; z 169.02 to 193.01 |

*Count after fan triangulation of polygon vertex lists, not measured render-time GPU triangles. Mesh units are not asserted without a target-scene import.

All three have nondegenerate UV coordinate ranges. This is a significant improvement over the damaged UVs in ten of the older twelve-pack styles. The meshes were inspected structurally, **not yet visually fitted to Vesper**.

## Atlases and useful data

- `Hair Textures/Curls/`: 2,048x2,048 RGB diffuse color options (auburn, blue, brown, dark blond, dark brown, light blond, pink, editable), plus AO, DEPTH, METALLIC, NORMAL, OPACITY and ROUGHNESS.
- `Hair Textures/Straight/`: another 2,048x2,048 RGB group with color variants and AO, DEPTH, METALLIC, NORMAL, OPACITY and ROUGHNESS.
- `Hair Textures/`: ten full-hair diffuse variants, plus HAIR_AO, HAIR_DEPTH, HAIR_DIFFUSE_EDITABLE, HAIR_NORMAL, HAIR_OP. A small editable tutorial graphic is also present.
- No standalone root/ID mask file appears in this ZIP. Root color separation can be authored procedurally or from an editable/derived color map; do not claim that the ZIP supplies a dedicated root/ID mask.
- Curls opacity has real cutout content (roughly 81.4% of grayscale pixels under 40, 6.2% above 215 in a 512 px downsample), suitable for alpha cards but liable to large transparent overdraw areas without card trimming.

## What can improve our current styles

**Definitely useful**: strand breakup via opacity/normal, cutout taper, high-frequency curl texture, roughness differentiation, additional warm and cool color choices, a proven UV/material reference, and an authentic curly silhouette for a Vesper signature hair option.

**Requires adaptation**: older 12-style pack hair UVs must be re-atlased to the corresponding curl or straight region, not simply linked to Curls/OPACITY. Their geometry will remain straight/wavy unless reshaped; a texture will not change it into volumetric curls.

**Not established**: alpha licensing for shipping third-party maps in the public repo; final in-game fit; physical simulation/secondary animation; phone performance; scalp occlusion under hats; hair color matches across 3D lighting environments.

## Suggested integration plan

1. Make `Curly Mane` the new high-quality reference; `Curly Ponytail` and `Curly Punk` as alternate appearances.
2. Fit all three at the Vesper head anchor in Blender, preserving individual mesh UVs; keep paid source files out of Git.
3. Split the source into logical controllable hair pieces; use a scalp cap, card grouping and root/length color parameters. For highlights, preserve albedo texture variation and use a separate root-length/blend mask rather than flattening into one color.
4. Build LOD0 for hero preview, LOD1 for gameplay/phone, LOD2 for farther NPC silhouettes. Source triangle counts are a **starting point**, not performance acceptance.
5. Test color settings on the actual engine shader and mobile browser; record draw calls, overdraw and GPU memory before alpha pass.
6. On the older twelve styles, test only representative strands, not wholesale texture swapping. Prioritize Style 12 and 07.
