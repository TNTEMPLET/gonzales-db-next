#!/usr/bin/env bash
# Poll Vercel deployments for a git SHA (or latest) across AP Baseball projects.
# Usage:
#   scripts/poll-vercel-deploys.sh [sha]
#   scripts/poll-vercel-deploys.sh --target production [sha]
#   scripts/poll-vercel-deploys.sh --projects gonzales-db-next,apbaseball-llb [sha]
#
# Requires: /config/.secrets/vercel_token  (or VERCEL_TOKEN env)
set -euo pipefail

TARGET="${VERCEL_POLL_TARGET:-production}"
PROJECTS_CSV="${VERCEL_POLL_PROJECTS:-gonzales-db-next,apbaseball-llb,apbaseball-fallball,apbaseball-admin}"
SHA=""
TIMEOUT_SEC="${VERCEL_POLL_TIMEOUT_SEC:-600}"
INTERVAL_SEC="${VERCEL_POLL_INTERVAL_SEC:-15}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --projects) PROJECTS_CSV="$2"; shift 2 ;;
    --timeout) TIMEOUT_SEC="$2"; shift 2 ;;
    --interval) INTERVAL_SEC="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      SHA="$1"
      shift
      ;;
  esac
done

if [[ -z "$SHA" ]]; then
  SHA="$(git -C "$(dirname "$0")/.." rev-parse HEAD 2>/dev/null || true)"
fi
SHA_SHORT="${SHA:0:7}"

TOKEN="${VERCEL_TOKEN:-}"
if [[ -z "$TOKEN" && -f /config/.secrets/vercel_token ]]; then
  TOKEN="$(tr -d '\n\r ' </config/.secrets/vercel_token)"
fi
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: No Vercel token (set VERCEL_TOKEN or /config/.secrets/vercel_token)" >&2
  exit 2
fi

API="https://api.vercel.com"
AUTH=( -H "Authorization: Bearer ${TOKEN}" )

# Resolve project name → id map once
mapfile -t PROJECT_NAMES < <(echo "$PROJECTS_CSV" | tr ',' '\n' | sed '/^\s*$/d')

declare -A PROJECT_IDS=()
curl -sS "${AUTH[@]}" "${API}/v9/projects?limit=100" -o /tmp/vercel_projects_poll.json
while IFS=$'\t' read -r pid pname; do
  PROJECT_IDS["$pname"]="$pid"
done < <(python3 - <<'PY'
import json
d = json.load(open("/tmp/vercel_projects_poll.json"))
for p in d.get("projects") or []:
    print(f"{p['id']}\t{p['name']}")
PY
)

echo "=== Vercel deploy poll ==="
echo "target=$TARGET sha=${SHA:-latest} projects=${PROJECTS_CSV}"
echo

deadline=$(( $(date +%s) + TIMEOUT_SEC ))
declare -A FINAL_STATE=()
declare -A FINAL_URL=()
declare -A FINAL_ID=()

all_ready() {
  local name
  for name in "${PROJECT_NAMES[@]}"; do
    local st="${FINAL_STATE[$name]:-}"
    [[ "$st" == "READY" ]] || return 1
  done
  return 0
}

any_failed() {
  local name
  for name in "${PROJECT_NAMES[@]}"; do
    local st="${FINAL_STATE[$name]:-}"
    case "$st" in
      ERROR|CANCELED) return 0 ;;
    esac
  done
  return 1
}

while true; do
  now=$(date +%s)
  if (( now > deadline )); then
    echo "TIMEOUT after ${TIMEOUT_SEC}s" >&2
    break
  fi

  for name in "${PROJECT_NAMES[@]}"; do
    pid="${PROJECT_IDS[$name]:-}"
    if [[ -z "$pid" ]]; then
      FINAL_STATE["$name"]="MISSING_PROJECT"
      continue
    fi

    # Prefer deployment matching meta githubCommitSha when SHA provided
    curl -sS "${AUTH[@]}" \
      "${API}/v6/deployments?projectId=${pid}&target=${TARGET}&limit=12" \
      -o "/tmp/vercel_deploys_${name}.json"

    read -r state url did < <(python3 - <<PY
import json, sys
sha = ${SHA@Q}
sha_short = ${SHA_SHORT@Q}
d = json.load(open("/tmp/vercel_deploys_${name}.json"))
deps = d.get("deployments") or []
pick = None
if sha:
    for dep in deps:
        meta = dep.get("meta") or {}
        full = (meta.get("githubCommitSha") or meta.get("gitCommitSha") or "")
        if full == sha or full.startswith(sha_short) or (sha and full.startswith(sha[:12])):
            pick = dep
            break
if pick is None and deps:
    pick = deps[0]
if not pick:
    print("NONE - -")
    sys.exit(0)
uid = pick.get("uid") or pick.get("id") or "-"
url = pick.get("url") or ""
state = (pick.get("readyState") or pick.get("state") or "UNKNOWN").upper()
print(f"{state} {url} {uid}")
PY
    )

    FINAL_STATE["$name"]="$state"
    FINAL_URL["$name"]="$url"
    FINAL_ID["$name"]="$did"
  done

  echo "$(date -u +%H:%M:%S) status:"
  for name in "${PROJECT_NAMES[@]}"; do
    echo "  ${name}: ${FINAL_STATE[$name]:-?}  ${FINAL_URL[$name]:-}"
  done
  echo

  if all_ready; then
    echo "ALL READY"
    exit 0
  fi
  if any_failed; then
    echo "FAILURE detected — not all projects Ready" >&2
    exit 1
  fi

  sleep "$INTERVAL_SEC"
done

echo "Final:"
for name in "${PROJECT_NAMES[@]}"; do
  echo "  ${name}: ${FINAL_STATE[$name]:-?}  ${FINAL_URL[$name]:-}"
done
exit 1
