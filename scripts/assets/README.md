# Automatic private asset uploads (Windows)

Avensky keeps code, asset paths and SHA-256 release metadata in public GitHub. **Commercial GLBs, FBXs, source textures and raw license-controlled exports remain private**. Never commit vendor-owned bytes or put them into GitHub Actions artifacts.

The uploader replaces collection-specific upload scripts and supports both list-based URL/hash/size manifests (the fitted hair pack) and URL-to-hash/size mappings (existing fitted garments). New hairstyles, dresses, accessories, character donors, and textures can use the same uploader after their metadata is approved.

It checks each export's hash and exact byte count, rejects incomplete GLBs and unsafe paths, and uploads only to immutable private S3 keys under `staging/objects/` using AWS profile `avensky-lightsail`. Existing keys are not overwritten. **Staging deploys no longer require an independent approval/verification ceremony per release**; a missing asset can fail that preview while the site and other updates still deploy. Keep restricted source files private, and follow the original creator's terms for the permitted scope of evaluation.

## One-time dry run and upload

In PowerShell, from your local Avensky repository:

~~~powershell
py -3 .\scripts\assets\staging_upload.py --source "$HOME\Downloads\AvenskyHairStaging" --manifest .\packages\wardrobe-catalog\fitted-hair.json --profile avensky-lightsail
~~~

The above command validates but **does not upload**. Add --upload to publish. For multiple collections repeat --manifest.

The private source directory may contain the files in its root, a flat models folder (the original hair ZIP), or matching logical models/characters/... paths. Keep it outside the public git checkout.

## Automatic export watcher

Choose a permanent private export folder, such as C:\AvenskyPrivate\exports. Run this once to install a **per-user Task Scheduler job at login** using your existing AWS CLI profile:

~~~powershell
.\scripts\assets\watch-staging-uploads.ps1 -Source "C:\AvenskyPrivate\exports" -Manifest @(".\packages\wardrobe-catalog\fitted-hair.json", ".\frontend\scripts\staging-fitted-assets.json") -InstallAtLogon
~~~

Omit -InstallAtLogon to keep it running in the current terminal instead. The watcher checks every 10 seconds and publishes matching, fully exported assets only. Unapproved, unlisted or half-written models are never uploaded. Use a permanent private source directory so the scheduled task continues to find exports after a restart. The task stores **no AWS keys**.

To stop it:

~~~powershell
Stop-ScheduledTask -TaskName "Avensky Private Staging Asset Watcher"
~~~

To remove it:

~~~powershell
Unregister-ScheduledTask -TaskName "Avensky Private Staging Asset Watcher" -Confirm:$false
~~~

## No repeated asset release steps for internal staging

Assets are experiments. A model may fail to load, clip, look unrealistic, or perform badly; this does **not** prevent an unrelated UI/game update from deploying. New assets follow the existing automatic uploader and checked-in catalog. On the fast staging server, **each main merge deploys the website and the matching game server**, with the gateway reading candidate asset paths from the installed catalog and streaming from private S3 on demand. No `STAGING_FITTED_HAIR` variable and no per-model verified release installation.

A one-time privileged staging-host update is documented in [Rapid staging deploy](../../docs/STAGING_AUTODEPLOY.md). It replaces the old receiver/gateway once; after that, new main merges do not need operator intervention. The protected staging domain and private S3 remain protected. **Production remains manual and requires a separate asset/license review.**

A working Windows watcher has **not** been confirmed yet: its last reported Task Scheduler result was `2`. The original 12 hairstyles were uploaded successfully by the earlier manual uploader. Fix the watcher once rather than repeating uploads on every new pack.

See [asset clearance](../../docs/ASSET_CLEARANCE.md): imported models are evaluation candidates, not guaranteed functional or commercially licensed. Individual/indie license terms depend on the creator and applicable business-size thresholds.

## Tests

~~~powershell
py -3 -m unittest discover -s scripts/assets -p "test_*.py" -v
~~~
