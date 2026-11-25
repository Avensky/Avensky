#!/usr/bin/env bash
# One-time private staging host update. Subsequent merges need no release checks.
set -euo pipefail
if [[ $(id -u) != 0 ]]; then echo 'Run once as root on staging host' >&2; exit 1; fi
source_root=${1:-$(pwd)}
release_user=${2:-avensky-stage}
staging_root=${3:-/srv/avensky-staging/frontend}
id "$release_user" >/dev/null
test -d "$staging_root/releases"
test -f "$source_root/deploy/frontend/publish.py"
test -f "$source_root/deploy/staging-assets/gateway.mjs"
python3 -m py_compile "$source_root/deploy/frontend/publish.py"
runuser -u avensky-assets -- test -r "$staging_root/releases" || { echo 'Gateway must read staging release catalog directory' >&2; exit 1; }
publisher=/usr/local/lib/avensky/publish.py
gateway=/opt/avensky/cloud-staging/deploy/staging-assets/gateway.mjs
override=/etc/systemd/system/avensky-staging-assets.service.d/zzzz-fast-staging.conf
test -f "$publisher"
test -f "$gateway"
timestamp=$(date +%s)
cp -a "$publisher" "$publisher.before-fast-staging-$timestamp"
cp -a "$gateway" "$gateway.before-fast-staging-$timestamp"
install -o root -g root -m 0755 "$source_root/deploy/frontend/publish.py" "$publisher"
install -o root -g root -m 0644 "$source_root/deploy/staging-assets/gateway.mjs" "$gateway"
install -o root -g root -m 0755 "$source_root/deploy/frontend/staging_game.py" /usr/local/lib/avensky/staging_game.py
mkdir -p "$(dirname "$override")"
cat > "$override" <<EOF
[Service]
Environment=AVENSKY_STAGING_FRONTEND_ROOT=$staging_root
EOF
rollback() {
  cp -a "$publisher.before-fast-staging-$timestamp" "$publisher"
  cp -a "$gateway.before-fast-staging-$timestamp" "$gateway"
  rm -f "$override"
  systemctl daemon-reload
  systemctl restart avensky-staging-assets.service
}
systemctl daemon-reload
if ! systemctl restart avensky-staging-assets.service; then rollback; exit 1; fi
if ! systemctl is-active --quiet avensky-staging-assets.service; then rollback; exit 1; fi
old_id=$(node -p 'require("/etc/avensky-assets/verified-tennis-alpha.json").release.id')
ready=0
for attempt in $(seq 1 20); do
  http=$(curl -sS --max-time 3 -o /tmp/avensky-stage-asset-header -w '%{http_code}' -H 'Range: bytes=0-3' "http://127.0.0.1:9060/__staging-assets/$old_id/models/roads/Road_Narrow_Oneway/Road_Narrow_Oneway_LOD0.glb" || true)
  if [[ $http == 206 && $(head -c 4 /tmp/avensky-stage-asset-header 2>/dev/null) == glTF ]]; then ready=1; break; fi
  sleep 1
done
if [[ $ready != 1 ]]; then rollback; echo 'Gateway did not recover' >&2; exit 1; fi
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
printf '%s ALL=(root) NOPASSWD: /usr/local/lib/avensky/staging_game.py *\n' "$release_user" > "$tmp"
chmod 0440 "$tmp"
visudo -cf "$tmp" >/dev/null
install -o root -g root -m 0440 "$tmp" /etc/sudoers.d/avensky-auto-staging
echo 'Staging fast path installed: future main merges publish without S3 release approval.'
