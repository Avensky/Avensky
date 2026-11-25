# Automatic main-to-staging deploy

Every merge to `main` builds the frontend and checks the matching Rust staging server. The archive includes `asset-release.json`, containing approved paths, hashes and sizes only, never private models. The restricted receiver invokes `/usr/local/lib/avensky/auto_activate.py` to verify any new private S3 objects and activate their ETag-pinned release on the gateway. Existing proofs are reused. It restores the old gateway configuration if activation or an HTTP 206 GLB probe fails. The previous site remains active until every gate passes.

## One-time host setup

The dedicated staging SSH key is forced to the restricted receiver. It cannot change root-owned services or install a new receiver. An authorized administrator must run the reviewed `deploy/staging-assets/bootstrap-auto-activate.sh` **once** from the checkout on Vultr, using the dedicated `avensky-stage` release user. The bootstrap installs the latest receiver, root-owned verifier, staging game deployer and narrowly scoped sudoers commands; it backs up the previous receiver. No repeated per-update commands or feature flags are required after that.

Until the one-time bootstrap is installed, GitHub Actions can build releases but the older Vultr receiver can still reject a changed asset release ID. A GitHub merge alone cannot confer root access to the server.

## Normal workflow

Export approved private asset → the Windows asset uploader sends digest-keyed GLBs to Lightsail S3 → commit catalog metadata and game/UI code → merge to main → GitHub Actions builds and publishes → staging receiver verifies new assets, activates gateway if needed, deploys Rust if changed, and atomically swaps the frontend. Missing files or failed tests preserve the last working staging site. Production remains separately approved and manual.
