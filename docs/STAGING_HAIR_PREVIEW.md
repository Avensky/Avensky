# 12 fitted hairstyles on staging

## Braided Ponytail

The wardrobe exposes Braided Ponytail under the existing `Mia_01` save ID. Its
private staging asset adds a root-to-tip coordinate, variation per strand, and
a section index to the fitted strand mesh. The wardrobe uses these to give
the crown, fringe, sides, face braids, nape, bun, and loose ponytail independent
base, root, highlight, and tip colors. Original colors preserve the baked
material. Mia's Blender color ramps are available as reusable themes.

On this fit, crown volume adds up to 3.5 mm of lift and crown strand width
varies by up to 22% on supported sections. The roots and contact areas carry
zero shape displacement. The stock-dress ponytail uses the export's separate
sway mask and the previously checked motion bounds. This staging candidate
still needs performance checks on physical devices.

Compatible fitted exports can supply `_AVENSKY_GROOM` as a vertex vector
`[rootToTip, variation, sectionIndex]`. See `hairGroom.ts` for the section order.
Optional `_AVENSKY_GROOM_LIFT` and `_AVENSKY_GROOM_WIDTH` vectors store the maximum
displacement in glTF rest space. Meshes without those channels retain the
shared palette behavior. The GLB travels through the authenticated staging
asset catalog.

The catalog contains 12 fitted styles `hair-01`…`hair-12`, but the wardrobe's old `alphaAssets.ts` list only included Space Buns and Mia. The build now injects all available catalog styles (`id`, display label, logical URL and actual GLB mesh name), and `SpaceBunsPreview` uses each model's mesh name (e.g. `Hair_01`) instead of trying to find a mesh named `hair-01`. Missing/broken test assets still fail within their preview boundary; other outfits continue to work.

## Temporary bridge for the already-running private asset gateway

Existing Vultr receiver `/usr/local/lib/avensky/publish.py` still expects the legacy **534-asset** release ID, even though the gateway already serves the **546-asset** hair release. Until the one-time root-owned receiver upgrade, the **staging-only** CI bundle keeps `bundle.json.assetRelease` at the previously accepted legacy ID but records the actual Vite client ID as `clientAssetRelease`. The Vite-built frontend continues to request the full 546-asset release, including all hairstyles, from the already-activated gateway. This bridge is limited to the password-protected staging environment; production is not changed.

After the server's fast staging receiver is installed, remove the compatibility ID and use the built catalog directly. This bridge does not activate future new asset release IDs automatically. The permanent host upgrade is described in `docs/STAGING_AUTODEPLOY.md`.
