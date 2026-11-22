# Frontend releases

After this workflow lands on `main`, merges build an isolated staging frontend in GitHub Actions. Once the staging connection is enabled, a successful build can replace the staging static site. Use **Actions → Frontend releases → Run workflow** on `main` to push a staged commit to the live frontend. The manual job uses a separate GitHub environment and a separately reviewed production bundle.

Both jobs release static files. The existing Rust containers, Caddy access controls and private Lightsail permissions stay in place. Server deployments and data migrations follow the [backend runbook](DEPLOYMENT_ENVIRONMENTS.md). Keep `STAGING_PLAYER_ONBOARDING` unset until the staging Rust backend supports registered accounts.

## One-time setup on Vultr

1. Pick separate writable release roots, such as `/srv/avensky-staging/frontend` and `/srv/avensky-live/frontend`, with a dedicated Unix user for each. Keep their parent directories and the installed `publish.py` under administrator control. Give Caddy read access to each site's static release tree. Give the live release user read access to staging receipts and to a separate administrator-owned directory of approved production bundles.
2. Install `deploy/frontend/publish.py` at `/usr/local/lib/avensky/publish.py`. Give each dedicated SSH key an entry in that user's `authorized_keys` with `restrict,command="…"` and the appropriate forced command from below. This leaves the key with access only to the release receiver. Use the known host key from a trusted console.

   ```sh
   python3 /usr/local/lib/avensky/publish.py staging /srv/avensky-staging/frontend --verified-manifest /etc/avensky/verified-staging.json
   python3 /usr/local/lib/avensky/publish.py production /srv/avensky-live/frontend --staging-root /srv/avensky-staging/frontend --approved-root /srv/avensky-live/approved
   ```

3. Create GitHub environments `staging` and `production`. Restrict them to `main` and configure production reviewer protection if available for the repository. In each environment set `RELEASE_HOST`, `RELEASE_USER`, and `RELEASE_KNOWN_HOSTS` as variables and `RELEASE_SSH_KEY` as a secret. Use separate credentials. [GitHub environment settings](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
4. Enable staging with the repository variable `STAGING_FRONTEND_DEPLOY_ENABLED=true`. Optionally set `STAGING_PLAYER_ONBOARDING=1` and `STAGING_OPEN_WORLD_ID` to match the staging backend. The next merge creates the first staging candidate.
5. Set the Caddy root for each site to its separate `current` path after confirming its first candidate. Preserve the staging authentication and `/__staging-assets/` routing. Run Caddy's config validation before reloading it. Record the previous roots for rollback. Enable the live job separately with `LIVE_FRONTEND_DEPLOY_ENABLED=true` after the approved bundle directory and production protection are in place.

## Staging and live gates

The staging build uses Git LFS pointers and keeps the GLBs out of its archive. Before switching the website, the Vultr receiver checks that the operator-verified manifest matches the build and the local asset gateway returns a valid byte range. If a commit changes model geometry, verify its new private manifest first. Cloud credentials stay with the gateway on Vultr. [Private staging asset runbook](CLOUD_ASSETS.md)

For live, prepare a production-mode build from the exact staged commit using the rights-cleared production assets. Review the **whole** production web directory against the production asset allowlist. In the administrator-owned approved directory, place `<commit>.tar.gz` containing `web/` and a top-level `bundle.json` such as `{"commit":"<full SHA>","environment":"production","licenseReview":"<review record>"}`. The live workflow checks the commit comes from `main`, and the receiver requires the matching staging receipt and reviewed bundle. The GitHub deployment key cannot create a production approval.

Releases are installed alongside prior versions. The receiver changes a symlink only after the complete candidate passes its checks. To roll back an affected environment, use its previous release's web directory as the target for an atomic symlink swap. Keep the previous checked asset manifest served by the staging gateway when its release differs. The SQL and career stores are independent of these frontend switches.
