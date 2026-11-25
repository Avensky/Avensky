#!/usr/bin/env bash
# Install the sign-in service for the frontend revision already active on staging.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo "Run on the staging host as root." >&2; exit 1; }
[[ $# == 0 || ( $# == 1 && ( $1 == --fresh || $1 == --portal-only || $1 == --ui-only ) ) ]] || { echo "Usage: install-sign-in.sh [--fresh | --portal-only | --ui-only]" >&2; exit 1; }
state=/var/lib/avensky-staging-deploy
exec 9>"$state/deploy.lock"
flock -x 9
web=$(readlink -e /srv/avensky-staging/frontend/current)
commit=$(basename "$(dirname "$web")")
[[ $commit =~ ^[0-9a-f]{40}$ && -s $web/images/garage-entry.css ]]
lib=/usr/local/lib/avensky/staging-access
check_game_version() {
  # Use the signed, read-only loopback metadata request. The service manager
  # supplies the key; neither it nor a player credential appears in argv.
  systemd-run --quiet --wait --pipe --collect -p DynamicUser=yes -p NoNewPrivileges=yes \
    -p EnvironmentFile=/etc/avensky/staging-alpha.env -p "LoadCredential=game-bridge.mjs:$1/game-bridge.mjs" \
    /usr/bin/node --input-type=module -e '
      const { gameBridge } = await import(process.env.CREDENTIALS_DIRECTORY + "/game-bridge.mjs");
      if (!await gameBridge(process.env.AVENSKY_ALPHA_GAME_KEY).supportsSessionTakeover())
        throw Error("Publish the session-aware staging game before refreshing the portal.");
    '
}
if [[ ${1:-} == --portal-only || ${1:-} == --ui-only ]]; then
  # The gate, issuer and portal must all run the same protocol revision.
  systemctl is-active --quiet avensky-alpha-access.service
  for asset in garage-runtime.json sign-in-navigation.js sign-in-input.js sign-in-controller.js sign-in-controller.css; do
    [[ -s $web/images/$asset ]]
  done
  backup=$(mktemp -d /root/avensky-sign-in-portal-XXXXXXXX)
  mkdir "$backup/candidate"
  files=(portal.mjs accounts.mjs game-bridge.mjs shared-database.mjs garageEntry.ts branding.ts palettes.json)
  for name in "${files[@]}"; do
    path=frontend/src/theme/$name
    if [[ $name == *.mjs ]]; then path=deploy/staging-access/$name; fi
    cp -p "$lib/$name" "$backup/$name"
    git --git-dir="$state/source.git" show "$commit:$path" > "$backup/candidate/$name"
  done
  node --input-type=module -e 'await import(process.argv[1] + "/portal.mjs")' "$backup/candidate"
  check_game_version "$backup/candidate"
  rollback_portal() {
    trap - ERR
    echo "Restoring the previous sign-in portal from $backup" >&2
    for name in "${files[@]}"; do cp -p "$backup/$name" "$lib/$name"; done
    systemctl restart avensky-alpha-access.service
  }
  trap rollback_portal ERR
  for name in "${files[@]}"; do install -m 0644 "$backup/candidate/$name" "$lib/$name"; done
  systemctl restart avensky-alpha-access.service
  url=http://127.0.0.1:9061
  curl --noproxy '*' --retry 8 --retry-all-errors --retry-delay 1 -fsS "$url/sign-in" -o "$backup/login.html"
  grep -q '/__alpha/entry/sign-in-input.js' "$backup/login.html"
  gate_status=$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' \
    -H 'Origin: https://staging.avensky.com' http://127.0.0.1:9062/socket)
  [[ $gate_status == 401 ]]
  for asset in garage-room.js sign-in-navigation.js sign-in-input.js sign-in-controller.js sign-in-controller.css; do
    curl --noproxy '*' -fsS "$url/__alpha/entry/$asset" -o /dev/null
  done
  # Exercise the same unsigned model request the browser makes, through the local staging vhost.
  garage_path=$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).model' "$web/images/garage-runtime.json")
  [[ $garage_path =~ ^/__staging-assets/[[:xdigit:]]{64}/models/world/garage_special[.]glb$ ]]
  curl --noproxy '*' --resolve staging.avensky.com:443:127.0.0.1 --range 0-3 -fsS \
    "https://staging.avensky.com$garage_path" -o "$backup/garage-header"
  [[ $(head -c 4 "$backup/garage-header") == glTF ]]
  trap - ERR
  echo "Sign-in portal updated to $commit. Previous files: $backup"
  exit 0
fi

volume=$(docker volume inspect --format '{{.Mountpoint}}' avensky-staging_avensky_staging_data)
[[ $volume == /var/lib/docker/volumes/avensky-staging_avensky_staging_data/_data ]]
player_db="$volume/staging/social.sqlite3"
[[ -s $player_db && $(stat -c %u "$player_db") == 10001 ]]
unit=/etc/systemd/system/avensky-alpha-access.service
config=/etc/caddy/Caddyfile
helper=/usr/local/lib/avensky/staging_game.py
backup=$(mktemp -d /root/avensky-sign-in-XXXXXXXX)
candidate="$backup/candidate"
mkdir "$candidate"
repo=(git --git-dir="$state/source.git" show)
for file in portal.mjs accounts.mjs game-bridge.mjs shared-database.mjs avensky-alpha-access.service; do
  "${repo[@]}" "$commit:deploy/staging-access/$file" > "$candidate/$file"
done
for file in palettes.json branding.ts garageEntry.ts; do
  "${repo[@]}" "$commit:frontend/src/theme/$file" > "$candidate/$file"
done
"${repo[@]}" "$commit:deploy/frontend/staging_game.py" > "$candidate/staging_game.py"
node --check "$candidate/portal.mjs"
node --check "$candidate/shared-database.mjs"
grep -Eq '^AVENSKY_ALPHA_GAME_KEY=.' /etc/avensky/staging-alpha.env
check_game_version "$candidate"
cp -a "$lib" "$backup/portal"
cp -a "$unit" "$backup/previous.service"
cp -a "$config" "$backup/Caddyfile"
cp -a "$helper" "$backup/previous-helper"
# Add only an exact sign-in handler inside the named staging site; leave imported/custom layouts to the operator.
python3 - "$config" "$candidate/Caddyfile" <<'PY'
import pathlib, re, sys
source, target = map(pathlib.Path, sys.argv[1:])
text = source.read_text()
sites = list(re.finditer(r"^(?:https://)?staging\.avensky\.com[ \t]*\{[ \t]*(?:#[^\n]*)?$", text, re.M))
if len(sites) != 1:
    raise SystemExit("Expected one standalone staging.avensky.com block in /etc/caddy/Caddyfile. Use the documented Caddy matcher for a custom layout.")
end = sites[0].end()
block = text[end:].split("\n}", 1)[0]
if not re.search(r"^\s*(?:handle /sign-in\s*\{|@\w+ path /sign-in /__alpha/\*)", block, re.M):
    text = text[:end] + """
    handle /sign-in {
        reverse_proxy 127.0.0.1:9061 {
            header_up X-Alpha-Client {remote_host}
            header_up -Authorization
        }
    }""" + text[end:]
target.write_text(text)
PY
# Adapt from the real config directory so any relative imports resolve as deployed.
candidate_config=$(mktemp /etc/caddy/.avensky-sign-in-XXXXXXXX)
trap 'rm -f "$candidate_config"' EXIT
cp "$candidate/Caddyfile" "$candidate_config"
caddy validate --config "$candidate_config" --adapter caddyfile
echo "Staging revision $commit. Rollback files: $backup"

# Docker records numeric owners on the volume. Host systemd also needs a
# passwd and group entry when it starts the migration and the portal.
ensure_portal_identity() {
  local name=avensky-staging current_user database by_id by_name
  current_user=$(systemctl show --property=User --value avensky-alpha-access.service)
  if [[ -n $current_user && $(id -u "$current_user" 2>/dev/null || :) == 10001 ]] &&
     getent group 10001 >/dev/null; then
    return 0
  fi
  for database in passwd group; do
    by_id=$(getent "$database" 10001 || :)
    by_name=$(getent "$database" "$name" || :)
    if [[ $by_id != "$by_name" ]]; then
      echo "Host $database entry for $name or ID 10001 is assigned elsewhere. Review the existing identity before cutover." >&2
      return 1
    fi
  done
  systemd-sysusers - <<'IDENTITY'
g avensky-staging 10001
u avensky-staging 10001:avensky-staging "Avensky staging sign-in" /nonexistent /usr/sbin/nologin
IDENTITY
  if [[ $(id -u "$name"):$(id -g "$name") != 10001:10001 ]]; then
    echo "$name must have UID and primary GID 10001. Review the existing identity before cutover." >&2
    return 1
  fi
}
ensure_portal_identity
# Exercise the same launch credentials and mounted database path while the old portal is online.
systemd-run --quiet --wait --pipe --collect --uid=10001 --gid=10001 \
  -p "BindPaths=$volume/staging:/run/avensky-player" \
  /usr/bin/test -w /run/avensky-player/social.sqlite3 || {
    echo "Systemd could not access the staging player database as 10001:10001. The existing portal is still running." >&2
    exit 1
  }

systemctl stop avensky-alpha-access
rollback() {
  echo "Sign-in installer failed at line $1 (exit $2). Restoring the previous services." >&2
  systemctl stop avensky-alpha-access || true
  cp -a "$backup/portal/." "$lib/"
  cp -a "$backup/previous.service" "$unit"
  cp -a "$backup/previous-helper" "$helper"
  cp -a "$backup/Caddyfile" "$config"
  systemctl daemon-reload
  systemctl start avensky-alpha-access
  systemctl reload caddy
  echo "Restored the previous services. Backups: $backup" >&2
}
trap 'rollback "$LINENO" "$?"' ERR
# Online SQLite backup captures a consistent snapshot even while the game is running.
python3 - "$player_db" "$backup/social.sqlite3" <<'PY'
import pathlib, sqlite3, sys
with sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri() + "?mode=ro", uri=True) as source, sqlite3.connect(sys.argv[2]) as dest:
    source.backup(dest)
PY
prior=/var/lib/avensky-alpha/game-access.sqlite3
if [[ ${1:-} == --fresh ]]; then
  source_arg=--fresh
else
  [[ -s $prior ]] || { echo "Existing unified access file missing. Use --fresh for an empty invitation list." >&2; false; }
  # Give the migration a private read-only snapshot, keeping the former portal's data in place.
  python3 - "$prior" "$backup/game-access.sqlite3" <<'PY'
import pathlib, sqlite3, sys
with sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri() + "?mode=ro", uri=True) as source, sqlite3.connect(sys.argv[2]) as dest:
    source.backup(dest)
PY
  source_arg=/run/avensky-prior.sqlite3
fi
install -m 0644 "$candidate"/{portal.mjs,accounts.mjs,game-bridge.mjs,shared-database.mjs,palettes.json,garageEntry.ts,branding.ts} "$lib/"
install -m 0644 "$candidate/avensky-alpha-access.service" "$unit"
install -m 0755 "$candidate/staging_game.py" "$helper"
systemctl daemon-reload
migration=(systemd-run --quiet --wait --pipe --collect --uid=10001 --gid=10001
  -p UMask=0077 -p EnvironmentFile=/etc/avensky/staging-alpha.env
  -p "BindPaths=$volume/staging:/run/avensky-player"
  --setenv=AVENSKY_GAME_DATABASE=/run/avensky-player/social.sqlite3)
if [[ $source_arg != --fresh ]]; then
  chown 10001:10001 "$backup/game-access.sqlite3"
  migration+=(-p "BindReadOnlyPaths=$backup/game-access.sqlite3:$source_arg")
fi
"${migration[@]}" /usr/bin/node "$lib/portal.mjs" consolidate-access "$source_arg"
systemctl start avensky-alpha-access
curl --noproxy '*' --retry 8 --retry-all-errors --retry-delay 1 -fsS http://127.0.0.1:9061/sign-in -o "$candidate/login.html"
grep -q 'data-live-garage' "$candidate/login.html"
# Preserve the original Caddyfile ownership and mode.
cat "$candidate/Caddyfile" > "$config"
systemctl reload caddy
curl --noproxy '*' --resolve staging.avensky.com:443:127.0.0.1 -fsS https://staging.avensky.com/sign-in -o "$candidate/public.html"
grep -q 'data-live-garage' "$candidate/public.html"
trap - ERR
echo "Staging is serving the garage at https://staging.avensky.com/sign-in"
