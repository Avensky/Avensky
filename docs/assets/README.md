# Avensky asset readiness and hair intake

Avensky is the canonical public game repository. This directory tracks source-safe decisions for the alpha. It does **not** contain licensed third-party models or texture maps.

## Start here

- [Alpha asset readiness](ALPHA_ASSET_READINESS.md): user sign-off, integration state and release checks. Approval of one garment is not approval of every layered combination.
- [Curly hair set audit](CURLY_SET_AUDIT.md): inspection of three source FBXs and texture atlas families; adaptation and LOD plan.
- [Proposed hair catalog](hair_catalog.proposed.json): a planning document, **not** an installable runtime catalog. Do not copy this file over a production manifest.

## Implementation gap on Avensky `main` (checked 2026-11-19)

The base hair choices are Natural and Close crop. Private staging can additionally load twelve fitted Vesper styles from its verified release. Open **Heroes → Character → Body → Hair**. The curly intake candidates are separate assets.

The private Espresso GLBs use embedded strand textures. The public fitted-hair catalog records their digests and lengths. Each selected model binds to the existing Vesper skeleton. In-game color, headwear clearance, save/reload and physical-phone performance still need visual testing. See the [staging installation procedure](../CLOUD_ASSETS.md#fitted-vesper-hairstyles).

Source files `CURLY HAIR SET.zip`, the 12-style commercial pack, character BLEND files and their extracted textures must remain outside this public repository until redistribution permissions are documented. The texture preview/contact sheet is deliberately not checked in.

## Review protocol

1. Verify source licenses and set up independent private asset installation and provenance.
2. Identify head anchor, accepted rig/bind pose and existing asset-loader fallback behavior in the live game.
3. Fit each candidate to Vesper with scalp, neck, collar, hat/hood and animation checks.
4. Keep base, roots, highlights and tips separately controllable where source maps support it. Any missing root/ID map must be authored rather than claimed as supplied.
5. Export LOD0 hero close-up, LOD1 mobile/gameplay and LOD2 distant/silhouette versions. Report triangles, draw calls, memory and overdraw on real devices.
6. Check identity selection, color round-trip, old saves and Rust/client serialization compatibility.
7. Record in-game pictures and explicitly approve or reject before changing the release grade.
