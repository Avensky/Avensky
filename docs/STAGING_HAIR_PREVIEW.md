# 12 fitted hairstyles on staging

The catalog contains 12 fitted styles `hair-01`…`hair-12`, but the wardrobe's old `alphaAssets.ts` list only included Space Buns and Mia. The build now injects all available catalog styles (`id`, display label, logical URL and actual GLB mesh name), and `SpaceBunsPreview` uses each model's mesh name (e.g. `Hair_01`) instead of trying to find a mesh named `hair-01`. Missing/broken test assets still fail within their preview boundary; other outfits continue to work.

## Temporary bridge for the already-running private asset gateway

Existing Vultr receiver `/usr/local/lib/avensky/publish.py` still expects the legacy **534-asset** release ID, even though the gateway already serves the **546-asset** hair release. Until the one-time root-owned receiver upgrade, the **staging-only** CI bundle keeps `bundle.json.assetRelease` at the previously accepted legacy ID but records the actual Vite client ID as `clientAssetRelease`. The Vite-built frontend continues to request the full 546-asset release, including all hairstyles, from the already-activated gateway. This bridge is limited to the password-protected staging environment; production is not changed.

After the server's fast staging receiver is installed, remove the compatibility ID and use the built catalog directly. This bridge does not activate future new asset release IDs automatically. The permanent host upgrade is described in `docs/STAGING_AUTODEPLOY.md`.
