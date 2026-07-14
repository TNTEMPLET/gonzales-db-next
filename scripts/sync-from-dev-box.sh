#!/usr/bin/env bash
# OPTIONAL: pull dev-box runtime tree → this workspace (for git commit on deep-thought).
# Default model is edit-only on box — do not run this automatically with --delete unless
# you intend to overwrite local /config copies.
#
# Usage:
#   ./scripts/sync-from-dev-box.sh              # rsync box → local (no delete)
#   ./scripts/sync-from-dev-box.sh --delete      # make local match box exactly
set -euo pipefail

REMOTE="${DEV_BOX_HOST:-dev-box}"
REMOTE_DIR="${DEV_BOX_DIR:-/srv/code/gonzales-db-next}"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DELETE=false
SSH_CONFIG="${SSH_CONFIG:-/config/.ssh/config}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)
if [[ -f "$SSH_CONFIG" ]]; then
  SSH_OPTS+=(-F "$SSH_CONFIG")
elif [[ -f /srv/config/.ssh/config ]]; then
  SSH_OPTS+=(-F /srv/config/.ssh/config)
fi

for arg in "$@"; do
  case "$arg" in
    --delete) DELETE=true ;;
    -h|--help)
      echo "Usage: $0 [--delete]"
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

RSYNC_EXCLUDES=(
  --exclude node_modules
  --exclude .next
  --exclude .next-master
  --exclude .next-gonzales
  --exclude .next-ascension
  --exclude .next-ladistrict2
  --exclude .next-ladistrict6
  --exclude .next-fallball
  --exclude .git
  --exclude '.env*'
  --exclude 'public/images/*.original.png'
)

FLAGS=(-av)
if [[ "$DELETE" == true ]]; then
  FLAGS+=(--delete)
fi

echo "→ Pulling ${REMOTE}:${REMOTE_DIR} → ${LOCAL_DIR}"
rsync "${FLAGS[@]}" "${RSYNC_EXCLUDES[@]}" \
  -e "ssh ${SSH_OPTS[*]}" \
  "${REMOTE}:${REMOTE_DIR}/" "${LOCAL_DIR}/"
echo "✓ Pull done. Review git status before commit."
