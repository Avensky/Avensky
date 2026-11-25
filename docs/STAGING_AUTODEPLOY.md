# Main-to-staging automatic deployment

Every push or merge to `Avensky/Avensky:main` triggers [Deploy to staging](../.github/workflows/deploy-staging.yml). Its jobs build and test the frontend, compare the commit to the latest main tip, then publish the matching bundle to `https://staging.avensky.com`. The SSH publisher receives a staging archive and always selects `publish-staging-with-game`. There is **no staging game deploy flag**.

The installed restricted receiver checks the candidate release ID against the private verified asset gateway. The staging game deployer fetches that exact main commit and compares input tree hashes of `avenlab-server`, `packages/wardrobe-catalog`, and `.dockerignore`. UI-only changes **do not restart the game**. Backend or wardrobe-catalog changes build a candidate container, back up the persistent staging volume, restart only the staging container, run a WebSocket handshake health probe, and restore the previous image/data on failure. The frontend symlink changes only after those gates pass.

## Private assets

Asset catalogs are committed as URL, SHA-256 and size metadata; commercial GLBs remain in private Lightsail object storage. A separate Windows uploader uses the `avensky-lightsail` profile to publish approved exports under immutable `staging/objects/<sha256>` names. The candidate release must be verified with the staging read-only identity and exposed by the asset gateway **before merging new catalog metadata to main**. A merge never implicitly uploads raw private binaries from a public GitHub repository.

Until a dedicated on-host verifier/activator is configured, a newly introduced private asset still requires a one-time gateway manifest registration. **A successful workflow for code changes does not bypass that gate.** Track the remaining automation and asset activation work in issue #51. Existing sessions continue using the old verified release.

## Live deployment

The [production release workflow](../.github/workflows/frontend-release.yml) is `workflow_dispatch` only and still requires reviewed production artifacts, staging provenance, and manual approval. No archive is passed to the SSH publisher, so the operation remains `publish-frontend` and **cannot restart the staging game**.

## Verify a deployment

After a merge, check the `Deploy to staging` Actions run and confirm the published commit in its `publish-staging` job. Read the site's protected `/bundle.json` with a tester session; it should report the deployed main commit and verified asset release. Test a byte-range GLB request, player login and a WebSocket connection. If a release gate fails, the prior staging frontend and model release remain available; use the receiver's existing backup and game rollback mechanisms. Production is never automatically changed.
