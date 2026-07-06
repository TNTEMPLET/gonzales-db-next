#!/usr/bin/env bash
# Point this repo at tracked git hooks (post-commit → dev-box sync).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

chmod +x scripts/git-hooks/post-commit scripts/sync-dev-box.sh

git config core.hooksPath scripts/git-hooks

echo "✓ Git hooks installed (core.hooksPath=scripts/git-hooks)"
echo "  Post-commit: background sync to dev-box via scripts/sync-dev-box.sh"
echo "  Skip once:   SKIP_DEV_BOX_SYNC=1 git commit ..."
echo "  Logs:        \${TMPDIR:-/tmp}/gonzales-dev-box-sync.log"