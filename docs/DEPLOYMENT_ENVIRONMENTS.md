# Avensky environments: development, staging, production

Avensky has **one network-backed application service today: the Rust WebSocket server**. Player profiles, worlds, and social state are currently persisted to `social.json` (and related files beside it), **not a SQL database**. A future `DATABASE_URL` would be **server-only** and must be isolated the same way; no database credentials belong in `VITE_*`.

This is a separate deployment change; it does not migrate the running Vultr server, its persisted profiles, or the private Lightsail model bucket.

## Frontend URL selection

| Vite mode | Build/run | WebSocket target | Safety |
| --- | --- | --- | --- |
| `development` | `npm --prefix frontend run dev` | `ws://<browser-host>:9001/` by default (also works on LAN) | Refuses `api.avensky.com` overrides |
| `test` | test harness / `--mode test` | **Explicit `VITE_RUST_WS_URL` required** | No automatic live fallback |
| `staging` | `npm --prefix frontend run build -- --mode staging` | **Explicit `VITE_RUST_WS_URL` required** | Refuses `api.avensky.com` overrides |
| `production` | `npm --prefix frontend run build` | `wss://api.avensky.com/ws/` | Only connects when page host is `play.avensky.com`, requires `wss:` and canonical live API host |

- Vite `MODE` selects the environment; `VITE_DEPLOY_ENV` verifies it, rather than overriding it silently.
- `frontend/.env.development` and `frontend/.env.production` contain public, nonsecret defaults.
- To configure staging, copy `frontend/.env.staging.example` to **ignored** `frontend/.env.staging` and set the actual staging WebSocket hostname *after* deploying staging. Example names are not provisioned DNS.
- **Do not use a production build for local testing.** A production bundle served from localhost refuses to open live sockets; use `--mode staging` or Vite dev.
- A browser cannot keep a `VITE_*` secret. Never set a database password, AWS access key, or private license token in a Vite env file.
- There is no live REST API or configured SQL database to route yet; `VITE_API_BASE_URL` is not an active data-store selector.

## Rust server persistence

Server environment is chosen with **`AVENLAB_ENV`**, independently of frontend settings.

| AVENLAB_ENV | `AVENLAB_SOCIAL_PATH` behavior |
| --- | --- |
| omitted / `development` | Preserves legacy `avenlab-server/runtime/social.json` unless overridden |
| `test` | Default `avenlab-server/runtime/test/social.json`; explicit absolute path must contain a `test/` component |
| `staging` | Requires explicit absolute path containing a `staging/` component |
| `production` | Requires explicit absolute path; rejects `test/` or `staging/` components |

An unknown environment fails startup. Staging and production do not silently fall back to the local development data file. This isolates **paths** but isn't a substitute for separate containers, volumes, credentials, database instances, and access policies.

### Already-running Vultr production deployment (do not erase player data)

The live instance currently runs from `/opt/avensky/app/compose.yaml` as `app-game-1`, bound to `127.0.0.1:9001` and using the existing `app_avensky_data` volume for `/data/social.json`.

When deploying this branch after code review:

1. Back up `app_avensky_data` and the local `compose.yaml`, `avenlab-server/Dockerfile`, and `.dockerignore` first. **Do not use `docker compose down -v`.**
2. Note: Dockerfile and `.dockerignore` were created manually on that server before being tracked in Git. If `git pull` refuses to overwrite those untracked files, move them aside after making backups rather than using `git clean -fd`.
3. Retain the existing live `compose.yaml`, project name, port mapping and `app_avensky_data` volume, and add the following environment value to `game.environment`:

   ```yaml
   AVENLAB_ENV: "production"
   AVENLAB_SOCIAL_PATH: "/data/social.json"
   ```

4. Rebuild/recreate the live container only during a planned deployment. The application will log `environment=production social_data=/data/social.json`.
5. Confirm `https://api.avensky.com/health` and a `101 Switching Protocols` response on `wss://api.avensky.com/ws/`.

Do **not** replace the live deployment with a new Compose project or volume name: doing that could make existing player profiles appear to have vanished.

### Optional staging container (isolated)

After provisioning space for an additional Rust process on Vultr, use the tracked staging Compose file:

```sh
cd /opt/avensky/app
docker compose -f compose.staging.yaml config --quiet
docker compose -f compose.staging.yaml up -d --build
docker compose -f compose.staging.yaml ps
docker compose -f compose.staging.yaml logs --tail=30 game
```

It uses:
- Compose project `avensky-staging` (not `app`).
- Private local port `127.0.0.1:9002` (not live port 9001).
- A distinct Docker volume (`avensky-staging_avensky_staging_data`) rather than the live `app_avensky_data`.
- Data file `/data/staging/social.json` and a smaller 6-player/2-world admission limit.

No staging service is launched until these commands run. Serving staging to remote users also requires its **own** DNS, Caddy HTTPS site and access controls, for example a `api-staging.avensky.com` WebSocket proxy to `127.0.0.1:9002`; do not route staging through `api.avensky.com`. Ensure this temporary test environment remains controlled and monitor the 4 GB VM before running both instances during a load test.

### Run checks

```sh
node --test frontend/tests/deployment-environment.test.mjs
cargo test --locked --manifest-path avenlab-server/Cargo.toml deployment_env::tests
```

The URL and data-path checks are only unit tests. Integration tests must still prove Caddy routing, a live socket connection, independent guest-profile creation, restart persistence, and that staging changes never appear in production.

## Model asset caution

See [Private staging assets](CLOUD_ASSETS.md) for the LFS-free staging build and authenticated Lightsail delivery setup.

The private AWS Lightsail `staging/` model bucket remains separate from app player-data staging. This configuration **does not** grant distribution rights or authorize publishing third-party GLBs in the game frontend. Before a public `play.avensky.com` build, review the asset inventory and release allowlist in the licensing tracker.
