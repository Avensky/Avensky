# Avensky: hair realism material batch

This is the **source-safe authoring pipeline**, not an in-game hairstyle install. It upgrades the material treatment of the **12 previously fitted Vesper hairstyles** while leaving the accepted meshes, rig, shape keys, authored source UVs and weights unchanged.

## Current result and validation

- 12 hairstyles mapped individually to strand donors from the user-supplied Curly Hair Set.
- Four planned colorways each: Espresso, Dark Auburn, Ash Brown, Caramel Balayage.
- Existing straight hair silhouettes are not changed. Natural waves use straight/wavy donor strips; only the naturally curled Hair_11 uses the Curls donor atlas.
- The **private** material-generation run produced 48 256×1024 RGBA/alpha color maps plus 12 normal and 12 AO/roughness/metallic maps.
- Material-map QA passed for all 12. Four source-safe Python unit tests passed.
- Blender 5.2.1 exported all twelve fitted Espresso GLBs with their embedded strand textures. The Avensky renderer bound each export to both the fitted reference and the shipped Vesper portrait. The head-turn and hair-color checks passed on all twelve styles. The [private staging installation](../../docs/CLOUD_ASSETS.md#fitted-vesper-hairstyles) enables the models in Vesper’s Body editor. In-game lighting and physical-mobile review remain open.

## Requirements

- Blender 5.2+ for mesh/GLB authoring.
- Python 3 with Pillow and NumPy for private material generation; these are not game runtime dependencies.
- The previously authored fitted 12-style Blender scene and the user-owned **CURLY HAIR SET.zip** source material.
- Never commit these commercial input files or the generated maps/GLBs to the **public** repository until redistribution permission is verified.

## Generate texture maps privately

```sh
python -m pip install pillow numpy
python scripts/hair/prepare_hair_materials.py \
  --curly-zip "/private/CURLY HAIR SET.zip" \
  --output "/private/Avensky_Hair_Realism_Batch_v1/materials"
```

To process only selected styles, use `--style-id Hair_12` (repeatable). Valid IDs are `Hair_01` through `Hair_12`. The authoring data lives in [hair_realism_catalog.json](hair_realism_catalog.json); it is **not** a production runtime manifest.

## Apply to fitted Vesper scene and export

```sh
blender -b "/private/AvenLab_Fitted_Hair_Pack.blend" \
  --python scripts/hair/blender_apply_batch.py -- \
  --materials "/private/Avensky_Hair_Realism_Batch_v1/materials" \
  --catalog scripts/hair/hair_realism_catalog.json \
  --output-blend "/private/Hair_Realism_12_Fitted.blend" \
  --glb-dir "/private/exports" \
  --preset espresso
```

Expected outputs **after successful Blender execution**: one revised fitted editable `.blend` and 12 standalone skinned hairstyle `.glb` assets, with a JSON receipt. The script checks the original triangle counts, verifies old UV and geometry hashes before and after, adds `HairRealismUV`, binds a PBR material with cutout opacity, tangent normal and roughness texture, and explicitly enforces glTF `MASK` alpha mode on exports.

The source scene and any commercially derived outputs stay in private storage.

## Checks

```sh
python -m unittest discover scripts/hair -p 'test_*.py' -v
python scripts/hair/validate_hair_batch.py \
  --catalog scripts/hair/hair_realism_catalog.json \
  --materials "/private/Avensky_Hair_Realism_Batch_v1/materials"
```

The unit tests need Pillow/NumPy but no installed Blender. The material validator requires locally generated images. Passing them does **not** prove runtime color accuracy or phone performance.

## In-game acceptance sequence

1. Export and reopen the 12 fitted styles; verify the 88-joint Vesper rig, weights, morphs, UV2 and hair-card alpha.
2. Visually compare `Hair_12`, `Hair_07` and `Hair_11` against their accepted shapes in garage, daylight and shade. Pay particular attention to thick ribbons, card direction and darker roots.
3. Wire color presets to Avensky's Identity/Appearance catalog without breaking existing `natural` and `cropped` save IDs. Keep any new selections hidden until an installed asset is available.
4. Check hoods/collars, driving head turns, transparency sort and physical phone GPU cost.
5. Update `docs/assets/` readiness when the documentation PR is merged, and retain **provisional** approval until the in-game review.

### Repository boundary

Do not copy automotive research, CAN-bus tooling, soft-body solvers or experimental datasets from AvenLab into Avensky. Do not publish paid assets merely because their authoring settings were updated.
