# Private staging assets

The staging client loads GLBs and their model textures on demand from a same-origin gateway. The gateway reads the private Lightsail bucket in `us-west-2` and streams the response without writing the model to Vultr disk. The browser sees only `/__staging-assets/<release-id>/<asset-path>`. The staging WebSocket still uses its own `api-staging.avensky.com` setting. Development and production keep their local asset paths and build workflows.

The city and vehicle selectors still choose the authored geometry and texture tiers. Each tier has its own versioned URL and private browser cache entry. Existing city, fleet, garage, and portrait fallbacks handle unavailable models where those fallbacks exist. An unhandled staging load error shows a reload screen. Unknown release paths return 404. Upstream errors and changed objects fail without entering the cache.

## Build on Vultr or in CI

Use Node 24 and Git LFS. A new staging checkout can skip LFS downloads entirely.

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/Avensky/Avensky.git
cd Avensky
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

## Verify the private bucket

Keep Lightsail set to **All objects are private** and public overrides disabled. The gateway needs download access only to the staging paths it serves. Use a dedicated IAM identity with scoped `s3:GetObject` access where supported. Lightsail bucket access keys grant read and write for the entire bucket. Set credentials through the AWS CLI credential chain for the gateway service account, and keep the publisher credential separate. [Lightsail bucket permissions](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-understanding-bucket-permissions.html) · [Lightsail IAM policies](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bucket-management-policies.html)

Verification tries `staging/objects/<sha256>` first, then `staging/<logical-path>` if the digest key cannot be read. For example, it can reuse the existing object at `staging/models/world/garage_special.glb` if its bytes match. If the existing prefix has a different layout, reconcile missing paths using the manifest. Run the bucket settings inspection with an AWS operator profile that can read Lightsail settings:

```sh
export AVENSKY_ASSET_BUCKET='<private Lightsail bucket name>'
aws lightsail get-buckets --region us-west-2 --bucket-name "$AVENSKY_ASSET_BUCKET" --query 'buckets[0].accessRules'
```

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
  frontend/.asset-release/staging.json frontend/.asset-release/verified-staging.json
```

Keep the verified file outside the web root with the matching frontend release. The gateway pins each object to its verified ETag, so an object that changes after verification fails closed.

## Serve only to authorized testers

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
