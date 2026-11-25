#!/usr/bin/env bash
set -euo pipefail
if [[ $(id -u) != 0 ]]; then echo 'Install as root once' >&2; exit 1; fi
root=${1:-$(pwd)}
user=${2:-avensky-stage}
id "$user" >/dev/null
test -f "$root/deploy/staging-assets/auto_activate.py"
python3 -m py_compile "$root/deploy/staging-assets/auto_activate.py" "$root/deploy/frontend/publish.py"
dst=/usr/local/lib/avensky/staging-verifier
install -d -m 0755 "$dst/deploy/staging-assets" "$dst/frontend/scripts" "$dst/frontend/src/assets"
for file in verify.mjs verify-release.mjs object-store.mjs; do
  install -o root -g root -m 0644 "$root/deploy/staging-assets/$file" "$dst/deploy/staging-assets/$file"
done
install -o root -g root -m 0644 "$root/frontend/scripts/staging-release.mjs" "$dst/frontend/scripts/staging-release.mjs"
install -o root -g root -m 0644 "$root/frontend/src/assets/assetPaths.ts" "$dst/frontend/src/assets/assetPaths.ts"
install -o root -g root -m 0755 "$root/deploy/staging-assets/auto_activate.py" /usr/local/lib/avensky/auto_activate.py
install -o root -g root -m 0755 "$root/deploy/frontend/staging_game.py" /usr/local/lib/avensky/staging_game.py
old=/usr/local/lib/avensky/publish.py
test -f "$old"
cp -a "$old" "$old.before-auto-staging-$(date +%s)"
install -o root -g root -m 0755 "$root/deploy/frontend/publish.py" "$old"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
printf '%s ALL=(root) NOPASSWD: /usr/local/lib/avensky/auto_activate.py, /usr/local/lib/avensky/staging_game.py *\n' "$user" > "$tmp"
chmod 0440 "$tmp"
visudo -cf "$tmp" >/dev/null
install -o root -g root -m 0440 "$tmp" /etc/sudoers.d/avensky-auto-staging
echo 'Staging receiver and automatic asset activator installed. Future main merges require no setup.'
