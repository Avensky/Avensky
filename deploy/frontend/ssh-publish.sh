#!/usr/bin/env bash
set -euo pipefail

commit=${1:?Supply a commit SHA}
[[ $commit =~ ^[0-9a-f]{40}$ ]]
missing=()
for setting in RELEASE_HOST RELEASE_USER RELEASE_KNOWN_HOSTS RELEASE_SSH_KEY; do
  if [[ -z ${!setting:-} ]]; then
    missing+=("$setting")
  fi
done
if (( ${#missing[@]} )); then
  echo "::error::Missing GitHub environment settings: ${missing[*]}. Configure the Vultr release connection and retry." >&2
  exit 1
fi
[[ $RELEASE_HOST =~ ^[A-Za-z0-9][A-Za-z0-9.-]+$ ]]
[[ $RELEASE_USER =~ ^[a-z_][a-z0-9_-]*$ ]]

ssh_files=$(mktemp -d)
trap 'rm -f "$ssh_files/key" "$ssh_files/known_hosts"; rmdir "$ssh_files"' EXIT
umask 077
printf '%s\n' "${RELEASE_SSH_KEY:?}" > "$ssh_files/key"
printf '%s\n' "${RELEASE_KNOWN_HOSTS:?}" > "$ssh_files/known_hosts"

# The archive is supplied only by main's staging workflow. Its publisher always
# checks the staging game inputs, skipping a restart if the code/catalog is unchanged.
# The manually approved production workflow passes no archive and never touches the game.
operation=publish-frontend
if [[ -n ${2:-} ]]; then
  [[ -f $2 && -r $2 ]] || { echo "Cannot read the staging bundle" >&2; exit 1; }
  operation=publish-staging-with-game
fi

# The remote key is limited to the frontend receiver. Send either the staging
# archive or an empty stream when promoting a reviewed on-host live bundle.
ssh -T -F /dev/null -i "$ssh_files/key" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_files/known_hosts" \
  "$RELEASE_USER@$RELEASE_HOST" "$operation $commit" < "${2:-/dev/null}"
