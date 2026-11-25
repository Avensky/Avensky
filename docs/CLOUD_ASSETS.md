# Private staging assets

The staging client loads GLBs and their model textures on demand from a same-origin gateway. The gateway reads the private Lightsail bucket in `us-west-2` and streams the response without writing the model to Vultr disk. The browser sees only `/__staging-assets/<release-id>/<asset-path>`. The staging WebSocket still uses its own `api-staging.avensky.com` setting. Development and production keep their local asset paths and build workflows.

The city and vehicle selectors still choose the authored geometry and texture tiers. Each tier has its own versioned URL and private browser cache entry. Existing city, fleet, garage, and portrait fallbacks handle unavailable models where those fallbacks exist. An unhandled staging load error shows a reload screen. Unknown release paths return 404. Upstream errors and changed objects fail without entering the cache.

The [scaling architecture](SCALING_ARCHITECTURE.md) shows where the gateway, Rust servers, build pipelines and browser performance features fit together.

## Build on Vultr or in CI

Use Node 24 and Git LFS. A new staging checkout can skip LFS downloads entirely.

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/Avensky/Avensky.git
cd Avensky
# While testing the open pull request, also run:
# GIT_LFS_SKIP_SMUDGE=1 git switch feat/cloud-asset-streaming
npm --prefix frontend ci
cp frontend/.env.staging.example frontend/.env.staging
npm --prefix frontend run build -- --mode staging
node --test frontend/tests/cloud-assets.test.mjs frontend/tests/deployment-environment.test.mjs
```

Serve only `frontend/dist-staging/`. The private operator manifest at `frontend/.asset-release/staging.json` records logical paths, lengths, SHA-256 digests and preview metadata. Tracked GLB digests come from Git LFS. The stage build validates the checked-in road, garage and map-kit colliders and outlines against their input and output hashes. When those change, install the affected LFS objects, regenerate the corresponding collider data and run:

```sh
npm --prefix frontend run assets:lock-colliders
```

### Prebuilt previews and generated tiers

With no prebuilt metadata, the release uses tracked assets and falls back to full vehicle previews and the existing harbor rendering fallback. To include generated Harbor facades, Heroes vehicle previews, packed Vesper previews and derived wardrobe geometry, run the authoring step on a workstation with the corresponding approved inputs installed:

```sh
npm --prefix frontend run assets:prepare
```

Transfer `frontend/.asset-release/prebuilt.json` to the build host. Publish the generated models separately to private object storage from the authoring workstation. Build against the metadata:

```sh
AVENSKY_PREBUILT_ASSETS="$PWD/frontend/.asset-release/prebuilt.json" npm --prefix frontend run build -- --mode staging
```

The build rejects metadata when its tracked asset inventory or generator inputs and recipes changed. Runtime GLBs can embed textures or reference relative URLs to other assets in the same release. The verifier rejects external origins, missing sidecars and dependencies that escape the release route.

### Fitted Vesper hairstyles

The twelve standalone Espresso GLBs are distributed to the staging operator in a private pack. Their expected sizes and SHA-256 digests are in `packages/wardrobe-catalog/fitted-hair.json`. Use the pack matching these digests. The public repository contains the catalog and runtime code.

1. Upload the selected GLBs under `staging/objects/<sha256>` using the private bucket procedure below. The upload helper in the private pack checks the files against the catalog.
2. On the verification host, generate the staging manifest from the same commit as the frontend. Set `AVENSKY_STAGING_FITTED_HAIR=hair-12` for the first style or `all` for all twelve. A comma-separated list enables a subset. Use the same selection for the build and for verification.

   ```sh
   AVENSKY_STAGING_FITTED_HAIR=all node --input-type=module -e \
     'import {writeFileSync} from "node:fs"; import {stagingRelease} from "./frontend/scripts/staging-release.mjs"; writeFileSync("staging-with-hair.json", JSON.stringify(stagingRelease(process.env.AVENSKY_PREBUILT_ASSETS)));'
   node deploy/staging-assets/verify.mjs staging-with-hair.json verified-staging-with-hair.json --models-root
   ```

3. Configure the gateway to serve the newly verified manifest alongside the previous release. Point the staging receiver's verified-manifest configuration at the new file. Set the GitHub repository Actions variable `STAGING_FITTED_HAIR` to the same selection, then run **Deploy to staging** on `main`. The existing receiver checks the manifest ID before switching the frontend. The game server build must include the updated wardrobe catalog to save the new IDs.
4. Select Vesper, open **Character → Body → Hair**, equip a style, turn her head and reload the saved profile. Check hat clearance and color on the target phone. Her glasses, harnesses and bracer are under **Appearance → Accessories → All items**.

## Automatic private asset uploads

New fitted hair, garments and donor meshes can use the tested [Windows watcher and manifest-driven uploader](../scripts/assets/README.md). It validates Blender exports against public hash metadata and uploads only approved matching files through the existing `avensky-lightsail` profile. Uploads do not by themselves activate a staging release; the separate server-side verified manifest and matching frontend release remain mandatory.

## Verify the private bucket

The staging build includes metadata for Vesper's fitted space buns, tennis dress and wedge sandals in `frontend/scripts/staging-fitted-assets.json`. The model files are installed separately in private storage for the login-protected alpha. Before changing this metadata on main, verify the new release on the staging gateway and retain the previous manifest for open sessions.

Keep the bucket default private. The shared bucket uses **Individual objects can be made public (read-only)** for selected media from other projects. Every Avensky release object needs an owner-only access control list (ACL) and must reject unauthenticated requests. The gateway needs download access only to the staging paths it serves. Use a dedicated IAM identity with scoped `s3:GetObject` access where supported. Lightsail bucket access keys grant read and write for the entire bucket. Set credentials through the AWS CLI credential chain for the gateway service account, and keep the publisher credential separate. [Lightsail object permissions](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-configuring-individual-object-access.html) · [Lightsail IAM policies](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bucket-management-policies.html)

The existing source is `s3://caring-vegan/staging/`. Its keys mirror the contents of `frontend/public/models/`. For example, the logical asset `/models/world/garage_special.glb` maps to `staging/world/garage_special.glb`. All 531 baseline release paths matched existing keys and sizes in the 566-object inventory. The byte and dependency checks below verify that the objects are the ones the build expects.

The verifier normally tries `staging/objects/<sha256>` first, then the models-root layout and then the full logical path under `staging/`. Use `--models-root` to check the existing bucket layout first. A readable object with the wrong bytes fails verification. Run the bucket settings inspection with an AWS operator profile that can read Lightsail settings.

```sh
export AVENSKY_ASSET_BUCKET=caring-vegan
aws lightsail get-buckets --region us-west-2 --bucket-name "$AVENSKY_ASSET_BUCKET" --query 'buckets[0].accessRules'
```

For rollout, confirm that the output shows `"getObject": "private"`. With public overrides enabled, use the per-object audit below to check the Avensky release.

Publish missing or generated models under their digest keys from an authorized workstation. Use the actual asset bytes and the manifest SHA-256 encoded as Base64:

```sh
# Set ASSET_SHA256 and ASSET_FILE from the reviewed manifest and authoring output.
aws s3api put-object --region us-west-2 --bucket "$AVENSKY_ASSET_BUCKET" \
  --key "staging/objects/$ASSET_SHA256" --body "$ASSET_FILE" \
  --if-none-match '*' --checksum-algorithm SHA256 \
  --checksum-sha256 "$(printf '%s' "$ASSET_SHA256" | xxd -r -p | base64)"
```

A conditional S3 copy can reuse an approved object already stored under a different private key. Verify copies with the same manifest verifier. [PutObject](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-object.html) · [CopyObject](https://docs.aws.amazon.com/cli/latest/reference/s3api/copy-object.html)

Run verification from a trusted machine with the gateway's read scope. The script streams every model through SHA-256, checks byte length and GLB dependencies, and records each verified ETag only after all objects pass. It writes zero model payloads to disk.

```sh
export AWS_PROFILE=avensky-staging-reader
node deploy/staging-assets/verify.mjs \
  frontend/.asset-release/staging.json frontend/.asset-release/verified-staging.json --models-root
```

Keep the verified file outside the web root with the matching frontend release. The gateway pins each object to its verified ETag, so an object that changes after verification fails closed.

Before rollout or after changing access settings, run the access audit using an operator profile with `lightsail:GetBuckets` and `s3:GetObjectAcl` permissions. It checks the bucket default and reads the ACL and anonymous response headers for each object in the verified release. It leaves the permissions of all objects as configured. Review any bucket-wide cross-account grants against the staging asset terms.

```sh
AWS_PROFILE=avensky-asset-operator node deploy/staging-assets/audit-access.mjs \
  frontend/.asset-release/verified-staging.json
```

## Serve only to authorized testers

The [staging tester portal](STAGING_TESTER_ACCESS.md) provides email sign-in, invitations, and optional two-factor authentication. Preview and verify that gate before swapping the existing staging access guard.

Start the gateway under a dedicated service account with Node 24, AWS CLI v2, the private bucket name, reader credentials and the verified release file. The process binds `127.0.0.1:9060`. Use the existing service manager to keep it running. For a rolling release, pass the previous verified file as an extra argument so already-open clients can finish loading.

```sh
node deploy/staging-assets/gateway.mjs frontend/.asset-release/verified-staging.json
```

Protect the staging frontend and its same-origin asset route with the same access control. For example, after replacing the hostname, root and password hash, integrate this into the **staging frontend** Caddy site. Keep the WebSocket sites and their routes separate.

```caddyfile
<private-staging-frontend-host> {
    basic_auth {
        tester <password-hash-from-caddy-hash-password>
    }
    handle /__staging-assets/* {
        reverse_proxy 127.0.0.1:9060
    }
    handle {
        root * /srv/avensky-staging/dist-staging
        try_files {path} /index.html
        file_server
    }
}
```

Use the existing private network or access gateway if one already protects staging. Keep the route out of public CDN caches. Authorized testers receive the model bytes, so grant access only where the asset terms permit it. [Caddy basic authentication](https://caddyserver.com/docs/caddyfile/directives/basic_auth) · [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

Before using the private frontend, verify that anonymous page and asset requests return an authentication challenge. Sign in and check that a full model and its lower tier load from the same origin, a single byte-range request returns 206, an unknown URL returns 404, and the staging WebSocket upgrades with HTTP 101. Open the garage, a wardrobe preview and a streamed city map. For rollback, serve the previous `dist-staging/` with its matching verified file. A public production cloud release needs its own rights-cleared assets and delivery configuration.
