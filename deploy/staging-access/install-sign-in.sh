#!/usr/bin/env bash
# Install the sign-in service for the frontend revision already active on staging.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo "Run on the staging host as root." >&2; exit 1; }
[[ $# == 0 || ( $# == 1 && $1 == --fresh ) ]] || { echo "Usage: install-sign-in.sh [--fresh]" >&2; exit 1; }
state=/var/lib/avensky-staging-deploy
exec 9>"$state/deploy.lock"
flock -x 9
web=$(readlink -e /srv/avensky-staging/frontend/current)
commit=$(basename "$(dirname "$web")")
[[ $commit =~ ^[0-9a-f]{40}$ && -s $web/images/garage-entry.css ]]
volume=$(docker volume inspect --format '{{.Mountpoint}}' avensky-staging_avensky_staging_data)
[[ $volume == /var/lib/docker/volumes/avensky-staging_avensky_staging_data/_data ]]
player_db="$volume/staging/social.sqlite3"
[[ -s $player_db && $(stat -c %u "$player_db") == 10001 ]]
lib=/usr/local/lib/avensky/staging-access
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
systemctl stop avensky-alpha-access
rollback() {
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
trap 'rollback' ERR
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
grep -q 'garage-entry-photo' "$candidate/login.html"
# Preserve the original Caddyfile ownership and mode.
cat "$candidate/Caddyfile" > "$config"
systemctl reload caddy
curl --noproxy '*' --resolve staging.avensky.com:443:127.0.0.1 -fsS https://staging.avensky.com/sign-in -o "$candidate/public.html"
grep -q 'garage-entry-photo' "$candidate/public.html"
trap - ERR
echo "Staging is serving the garage at https://staging.avensky.com/sign-in"
