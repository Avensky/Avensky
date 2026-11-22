# Avensky scaling architecture

Avensky splits three kinds of work. The Rust game server handles live multiplayer. The staging asset gateway moves model bytes from private object storage. The browser decides which models to load and renders them on the player's device. Each part has a different performance budget and can be measured separately.

## Servers and request paths

The two Rust WebSocket services are running on Vultr. The staging frontend and asset gateway below are the rollout design for Cloud Asset Streaming.

```mermaid
flowchart LR
    B["Staging browser · React and Three.js"]
    P["Vultr · Caddy HTTPS"]
    F["Vultr · staging HTML, JS and CSS"]
    G["Vultr · Node asset gateway · 127.0.0.1:9060"]
    S["AWS Lightsail · private caring-vegan/staging · us-west-2"]
    R["Vultr · staging Rust container · 127.0.0.1:9002"]
    B -->|"Authenticated page and asset requests"| P
    P -->|"Page and application files"| F
    P -->|"Versioned model and texture requests"| G
    G -->|"Signed object reads"| S
    B -->|"api-staging.avensky.com WebSocket"| P
    P -->|"Staging multiplayer"| R
```

| Component | Where it runs | Role |
| --- | --- | --- |
| Staging frontend | Browser and static files on Vultr | Caddy serves the built app behind staging access control. The browser loads the geometry and texture tiers selected for the current scene. |
| Staging asset gateway | Separate Node process on Vultr, loopback port 9060 | Matches each same-origin URL to a verified release, reads from Lightsail and streams bytes through to the browser. AWS credentials and signed URLs stay on the server. |
| Private model storage | AWS Lightsail Object Storage, `s3://caring-vegan/staging/`, `us-west-2` | Stores the heavy assets outside the Vultr filesystem. The release manifest determines which objects the gateway can serve. Staging access is limited to testers covered by the asset terms. |
| Staging multiplayer | Vultr, `api-staging.avensky.com`, host port 9002 | Runs the staging Rust container with a dedicated player-data volume and admission limits of six players and two active worlds. |
| Production multiplayer | Vultr, `api.avensky.com`, host port 9001 | Runs the live Rust container with its own persistent player data. Production keeps its existing frontend asset workflow. |
| Local development | Developer machine | Vite serves the app and local asset files. The development client uses a local Rust WebSocket by default. |

See the [environment configuration](DEPLOYMENT_ENVIRONMENTS.md), [staging Compose file](../compose.staging.yaml) and [private staging runbook](CLOUD_ASSETS.md).

## Build and delivery pipelines

1. **Author asset variants.** City tooling generates smaller textures and reduced geometry. Optional frontend scripts produce lighter character, wardrobe, Harbor and vehicle preview assets on a workstation with the approved inputs. These steps move generation work out of staging deployment. [City LOD tooling](../scripts/city-lod/README.md) · [Asset preparation](CLOUD_ASSETS.md#prebuilt-previews-and-generated-tiers)
2. **Compile with metadata.** Node 24 and Vite build the staging site from source, Git LFS pointers and prebuilt collider metadata. The build checks the collider lock against its source and output hashes and writes a manifest of expected model paths, sizes and digests. The public build directory contains zero GLBs. [Build configuration](../frontend/vite.config.ts) · [Collider verification](../frontend/scripts/prebuilt-colliders.mjs)
3. **Verify in CI and against storage.** GitHub Actions builds on Linux with LFS downloads disabled and checks the output. Before rollout, an operator verifies every manifest object against Lightsail. The verifier streams up to six objects at a time to check their SHA-256, sizes and relative GLB dependencies, then records their ETags. This reads the release over the network once per verification run and writes no model payloads to disk. [GitHub Actions workflow](../.github/workflows/cloud-assets.yml) · [Object verification](../deploy/staging-assets/verify-release.mjs)
4. **Deliver the requested tier.** The browser requests `/__staging-assets/<release-id>/<asset-path>`. Caddy gates access and forwards the request to the gateway. The gateway pins the read to the verified ETag, supports single byte ranges and gives authorized browsers a private cache entry. A release ID change gives the new release fresh URLs. [Browser URL resolver](../frontend/src/assets/assetPaths.ts) · [Streaming gateway](../deploy/staging-assets/gateway.mjs)

## Where performance can improve

| Mechanism | Work it reduces | What to measure |
| --- | --- | --- |
| Pointer-only deploy | Model bytes fetched during checkout and stored on the build host | Deployment time, checkout bytes and disk usage |
| City chunks and levels of detail (LODs) | Geometry and textures loaded and drawn as the camera moves. Fast and Balanced use 512 px and 1024 px texture variants for authored city templates. | Bytes transferred, draw calls, triangles and frame times on a fixed drive route |
| Fleet LOD queue | Duplicate and simultaneous model requests. The fleet loader coalesces requests, permits two active loads and uses already available models or compact seed geometry while a tier loads. | Requests in flight and time to visible vehicles |
| Prebuilt previews and browser workers | Preview geometry to decode, and main-thread work when the portrait runs in an offscreen worker | Time to first visible preview and main-thread stalls |
| Versioned browser cache | Model bytes fetched again on repeat visits to the same release | Cold versus warm model bytes and time to the first usable scene |

Implementation references include [city tier selection](../frontend/src/world/cityLod.ts), [fleet loading](../frontend/src/vehicles/fleetAssets.ts) and the [portrait worker](../frontend/src/game/characters/characterPortrait.worker.ts).

## A first scaling experiment

Run the same garage-to-city route with a cold browser cache, then repeat it with a warm cache on the same browser and device. Keep the build, map and quality settings fixed. Record time to first usable scene, model bytes transferred, frame time and the staging WebSocket connection time. For a second comparison, reset the cache and repeat with Original and Fast quality. Track which requests change along with the frame times so a smaller download and a faster frame are measured independently.

This release proves the staging build can complete with LFS pointers. The baseline manifest describes about 2.18 GiB of assets, all kept out of the deploy directory. The gateway still carries model traffic through Vultr on browser cache misses, so watch its outbound bandwidth, upstream response latency and error rate separately from Rust CPU and WebSocket latency. The live bucket match and device performance need staging measurements.
