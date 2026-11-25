# Automatic private asset uploads (Windows)

Avensky keeps code, asset paths and SHA-256 release metadata in public GitHub. **Commercial GLBs, FBXs, source textures and raw license-controlled exports remain private**. Never commit vendor-owned bytes or put them into GitHub Actions artifacts.

The uploader replaces collection-specific upload scripts and supports both list-based URL/hash/size manifests (the fitted hair pack) and URL-to-hash/size mappings (existing fitted garments). New hairstyles, dresses, accessories, character donors, and textures can use the same uploader after their metadata is approved.

It checks the hash and exact byte count, rejects incomplete GLBs and unsafe paths, and uploads only to immutable private S3 keys under staging/objects/ using AWS profile avensky-lightsail. Existing keys are not overwritten. The staging gateway must still independently verify the SHA-256 and ETag before serving a model.

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

## Staging activation, rollback and remaining infrastructure task

1. Approve the private export and update the public metadata manifest (logical URL, exact size, SHA-256) on a feature branch. Add new catalog paths to `frontend/scripts/staging-private-asset-catalogs.json`. Do **not** merge until staging verification and gateway activation are complete.
2. The Windows watcher automatically publishes matching models to private S3. An upload alone **does not activate** a release.
3. The trusted staging operator generates a new asset release from the **same main commit**, runs deploy/staging-assets/verify.mjs with read-only AWS credentials, and installs the verified release in the staging gateway while retaining the old one for current sessions.
4. The existing main-branch Deploy to staging workflow automatically builds the frontend. The receiver compares its asset-release ID to the gateway's verified release before activating the frontend; it fails closed on a mismatch.
5. Staging Rust server updates must be deployed separately when models introduce new saved choice IDs. Production remains manual and isolated.

**One-time infrastructure follow-up:** The Vultr staging receiver currently requires an operator to install verified asset manifests. Full end-to-end unattended activation needs a restricted staging-only verification and atomic activation command installed on the server and invoked by the deployment workflow *before* frontend publication. Do not bypass the verified-release check. Track this in issue #51; the new uploader is safe to use now.

## Tests

~~~powershell
py -3 -m unittest discover -s scripts/assets -p "test_*.py" -v
~~~
