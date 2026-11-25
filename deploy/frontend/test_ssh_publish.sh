#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
mkdir "$dir/bin"

cat > "$dir/bin/ssh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "$AVENSKY_TEST_SSH_ARGS"
cat > "$AVENSKY_TEST_SSH_INPUT"
STUB
chmod +x "$dir/bin/ssh"

export PATH="$dir/bin:$PATH"
export RELEASE_HOST=staging.example.invalid
export RELEASE_USER=avensky_release
export RELEASE_KNOWN_HOSTS='staging.example.invalid ssh-ed25519 AAAATEST'
export RELEASE_SSH_KEY='TEST PRIVATE KEY - NOT A CREDENTIAL'
export AVENSKY_TEST_SSH_ARGS="$dir/args"
export AVENSKY_TEST_SSH_INPUT="$dir/input"

sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
printf 'a staging bundle' > "$dir/bundle.tar.gz"

bash "$root/deploy/frontend/ssh-publish.sh" "$sha" "$dir/bundle.tar.gz"
grep -qx "publish-staging-with-game $sha" "$dir/args"
cmp "$dir/bundle.tar.gz" "$dir/input"

# The live workflow passes only a commit; it must never update the staging game.
bash "$root/deploy/frontend/ssh-publish.sh" "$sha"
grep -qx "publish-frontend $sha" "$dir/args"
test ! -s "$dir/input"

# Invalid archives fail without issuing an SSH deployment.
if bash "$root/deploy/frontend/ssh-publish.sh" "$sha" "$dir/nonexistent.tar.gz" > /dev/null 2>&1; then
  echo "Missing staging bundle unexpectedly deployed" >&2
  exit 1
fi
echo "Staging and production SSH release modes passed"
