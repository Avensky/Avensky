# Avensky asset clearance: alpha inventory and beta release gate

**Status:** inventory baseline, not a legal or technical approval. Source: tracked `.glb` paths on `main` (2026-11-20). Keep this documentation separate from game, wardrobe, performance, and deployment PRs. See [beta rights issue](https://github.com/Avensky/Avensky/issues/3).

## Inventory baseline

- `docs/asset-clearance/inventory.csv` lists **530** GLB paths found in Git. The Git tree reports **530 Git LFS pointer-sized entries**; it does **not** establish full binary sizes, hashes, presence in an AWS bucket or a valid source license.
- LODs, conversions, re-rigs, and recolors of the same source may share an underlying license **but should each be mapped to their original source family**. Do not double-count source purchases as independent permission grants.
- Local hair/character/car archives, purchased downloads, user-installed or ignored assets, music and textures outside these GLB paths are **not yet inventoried**.
- `needs-evidence` is the default state; **none of these entries have been approved for public delivery** by this audit.

## Two independent status tracks

| Track | Progression |
| --- | --- |
| Technical | candidate → fitted → integrated → desktop/mobile tested → approved for alpha |
| Distribution rights | needs-evidence → listing-and-license-verified → use-specific-terms-reviewed → public-browser-delivery-cleared → commercial-beta-approved |

An alpha fitting pass never implies distribution approval. A rights-cleared model can still be rejected on performance. Don't block code work because the beta rights audit is unfinished.

### Solo-developer evaluation policy (November 2026)

Avensky staging is an **experimental, password-protected internal review environment**. New third-party models and donor-derived experiments are **test candidates by default**. Their presence in staging means only *we are evaluating technical fit*, not that they work, are polished, have been purchased for commercial release, or have been cleared for distribution. Failed fit/LOD/material tests are expected and must not hold up unrelated code deploys.

- Evaluate whether a hair, body donor, outfit, vehicle or environment model fits and performs on desktop/mobile **before deciding whether to buy a commercial license**. A prototype may be rejected or replaced without a purchase.
- Keep master/source files and commercial store downloads out of the public repository. Private S3 and site passwords reduce access but **do not override the creator's terms**; a free or non-resale license may allow testing while restricting browser delivery, derivatives, use by invited testers, or redistribution. Check the specific asset's permissions before those activities.
- License tiers sometimes depend on the purchaser's **company size, annual revenue, number of seats or funding**. Avensky currently has one developer; use any applicable individual/indie tier only when its actual terms qualify. Reassess if the company/team/business changes.
- Treat unreviewed model families as **evaluation-only**, without making provenance forms, manual approval flags, or per-release S3 verification prerequisites for staging. Revisit source records and decide whether to purchase, attribute, replace or exclude an asset **only when choosing assets for external alpha/commercial beta**. Do not automatically promote unreviewed assets into public distribution.
- Record the important source/license family notes when known, but keep receipts and license files private. Prototype availability is independent of production rights and independent of whether the model actually renders.

This is an engineering workflow, **not a determination that a particular free, educational or solo-dev license allows distribution**; review the source terms before use.


## Private AWS Lightsail staging

**Do not switch the bucket to public-read for this audit.** Keep purchased masters, imported downloads, and unresolved third-party sources in a **private bucket** under a distinct prefix such as `staging/source/`, and publish only cleared, optimized derivatives from a separate release location once the appropriate rights and technical checks pass.

The source archive must **not** be bundled by Vite into `frontend/public/`, served by a public CDN, or copied into a public GitHub repo unless redistribution is authorized. The existing tracked GLB references may already have been pushed into public Git LFS; separately review **historic/public exposure** if rights don't allow redistributing model files. A new `.gitignore` or private bucket cannot undo that.

Keep the current runtime and client asset paths working until a separately reviewed release-asset migration is ready; do not change URLs in this tracking PR.

### Inventory and upload from the authorized source computer

1. Identify the real asset folders and original receipts/licensing documents locally; do not upload receipts, account tokens, or license keys to public GitHub.
2. Check the AWS Lightsail bucket's exact **bucket name, Region, current plan, access permissions, and available capacity**. Region is not inferred from the Vultr deployment. Keep an external backup.
3. For a manual trial, upload a small harmless nonlicensed file privately to `staging/` in the Lightsail console and verify it is not publicly accessible.
4. For bulk uploads, configure AWS CLI credentials for the Lightsail bucket on the **Windows source machine**, using the provider's current documentation. Do not place long-lived bucket keys on the public game server or in shell transcripts. Use S3-compatible AWS CLI commands only after the endpoint/permissions are confirmed.
5. Example with valid AWS CLI credentials and Windows PowerShell, replacing `YOUR-LIGHTSAIL-BUCKET` and folder path:

   ```powershell
   aws s3 sync "C:\AvenskyAssets" "s3://YOUR-LIGHTSAIL-BUCKET/staging/source/" --dryrun
   aws s3 sync "C:\AvenskyAssets" "s3://YOUR-LIGHTSAIL-BUCKET/staging/source/"
   ```

   Check the dry-run count, bytes and unexpected inclusions. Do not add `--delete`; preserve the purchased originals and private source records. The sync does not upload files not present on that machine.
6. Verify object count, returned errors, access permissions, and sample checksums locally and in AWS. Capture only totals and safe identifiers in GitHub.

Do not expose a wildcard access policy or a public distribution endpoint to the staging prefix. Storage alone is not a license to redistribute.

## Required provenance evidence per *source asset family*

Record:
- Exact source/marketplace URL and author/publisher identity, including license version at acquisition.
- Receipt / purchase order ID or screenshot **stored privately** (reference by ID only in public tracker).
- Original asset/file names, related derived GLBs, modifications and any attribution requirements.
- Permitted use: commercial / noncommercial, interactive games, adaptation, redistribution of raw source, redistribution embedded in a client game, web browser delivery, server-side-only and sublicensing.
- Third-party brand, trademark, copyright or editorial-only restrictions; visible logos may need a separate review.
- Technical status: triangle/texture sizes, LODs, material performance, mobile loading, clipping and quality.
- Decision: cleared, restricted to private testing, replace, ask creator for a license, or pending independent review.

The public inventory contains no purchase receipts, secret identifiers or license keys. Add those only to an access-controlled evidence store.

## Known starting leads (README attribution, not independently verified)

| Model/source family | Repository claim | Next action |
| --- | --- | --- |
| T-90M (With interior) by DerpDude — https://skfb.ly/oWGUu | CC BY 4.0 | Verify listing/version and file mapping; supply attribution and modification notice if needed |
| Panzer II by vmatthew — https://skfb.ly/oTOqy | CC BY 4.0 | Verify listing/version and file mapping; supply attribution and modification notice if needed |
| 2024 GMC Sierra 1500 AT4X by Ddiaz Design — https://sketchfab.com/3d-models/2024-gmc-sierra-1500-at4x-41d0b29e3d2f4854a9b6349ccf918a1e | CC BY-NC-SA 4.0 | NonCommercial restriction: acquire explicit commercial license or replace before commercial beta; review possible mapped vehicle LODs and branding |

These claims alone are insufficient to clear public distribution. Credits without the required license grants don't fix restricted use. Purchased/free downloads have their own license contracts.

## Garage props for private staging

The garage includes original procedural lockers, an engine hoist and a hydraulic floor jack in every build. Private staging can replace each prop at the same location once its evaluation model loads. The optimized GLBs live on the authenticated asset service and carry attribution and modification notices. Retire these staging entries or obtain clearance before public distribution.

| Prop | Artist and original | Staging adaptation |
| --- | --- | --- |
| Vehicle bay engine crane | [Dudzy, Engine Crane](https://sketchfab.com/3d-models/engine-crane-31fa381f73dd481daef557ea9fe66e79) | Static hoist with chassis, boom and hanging hook |
| Vehicle bay floor jack | [Jinhong Jeong, Car jack](https://sketchfab.com/3d-models/car-jack-b07e82ed61d145d5a3294d74f6183368) | Floor-centered red jack with its saddle and handle |
| Wardrobe cabinet | [Jinhong Jeong, Cabinet](https://sketchfab.com/3d-models/cabinet-b25dbbb846c54a9a9999fa686b01ec9b) | Three-door locker with its original decals |

All three source listings specify [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Each staging adaptation uses one material and reduced textures. Review or replace the cabinet decals when choosing the public model.

## Beta release checklist

- [ ] All shipping asset families mapped to source license evidence with permission for intended browser-game distribution
- [ ] All commercial, noncommercial, editorial-only, no-derivatives and raw-file redistribution restrictions handled
- [ ] No unreviewed item ships in the client/CDN allowlist; no raw archives in public builds
- [ ] Credits / creator links / license texts and change notices applied as required
- [ ] Rights and trademark/branding review completed for all hero vehicles
- [ ] Licensed or self-authored substitutes planned for blocked assets
- [ ] GLB integrity, collision and LOD parity; physical mobile-device performance tested
- [ ] AWS staging remains private; public asset delivery isolated and authenticated/allowlisted as needed
- [ ] No private engine/research code or commercial source archives in public GitHub

**Not a certification or legal opinion.** License texts, product terms and creator permissions must be checked against the intended release.
