#!/usr/bin/env bash
set -euo pipefail

commit=${1:?Supply a commit SHA}
[[ $commit =~ ^[0-9a-f]{40}$ ]]
[[ ${RELEASE_HOST:?} =~ ^[A-Za-z0-9][A-Za-z0-9.-]+$ ]]
[[ ${RELEASE_USER:?} =~ ^[a-z_][a-z0-9_-]*$ ]]

ssh_files=$(mktemp -d)
trap 'rm -f "$ssh_files/key" "$ssh_files/known_hosts"; rmdir "$ssh_files"' EXIT
umask 077
printf '%s\n' "${RELEASE_SSH_KEY:?}" > "$ssh_files/key"
printf '%s\n' "${RELEASE_KNOWN_HOSTS:?}" > "$ssh_files/known_hosts"

operation=publish-frontend
if [[ ${STAGING_GAME_DEPLOY_ENABLED:-false} == true ]]; then
  [[ -n ${2:-} ]] || { echo "The staging game requires a staging bundle." >&2; exit 1; }
  operation=publish-staging-with-game
fi

# The remote key is limited to the frontend receiver. Send either the staging
# archive or an empty stream when promoting a reviewed on-host live bundle.
ssh -T -F /dev/null -i "$ssh_files/key" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_files/known_hosts" \
  "$RELEASE_USER@$RELEASE_HOST" "$operation $commit" < "${2:-/dev/null}"
