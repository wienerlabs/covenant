#!/bin/bash
# Covenant deployment smoke test.
#
# Hits every public surface that should be working after a deploy
# and reports pass / fail / interesting. Designed to be safe to
# run against production (read-only except for one demoMode job
# creation which is record-only on the server).
#
# Usage:
#   ./scripts/smoke.sh
#   BASE=https://covenant.run ./scripts/smoke.sh
#   ./scripts/smoke.sh --json    # machine-readable output
#
# Exit codes:
#   0  all checks passed
#   1  at least one check failed
#   2  catastrophic (homepage 5xx)

set -uo pipefail

BASE="${BASE:-https://covenant.run}"
JSON_OUTPUT=0
[[ "${1:-}" == "--json" ]] && JSON_OUTPUT=1

PASS=0
FAIL=0
declare -a FAILED
declare -a RESULTS

color_pass="\033[32m"
color_fail="\033[31m"
color_dim="\033[2m"
color_reset="\033[0m"
[[ $JSON_OUTPUT -eq 1 ]] && color_pass="" color_fail="" color_dim="" color_reset=""

probe() {
  # probe <name> <method> <path> [<expected_code>] [<grep_pattern>]
  local name="$1"
  local method="$2"
  local path="$3"
  local expected_code="${4:-200}"
  local grep_pattern="${5:-}"

  local response code body
  if [[ "$method" == "POST" ]]; then
    response=$(curl -sw "\nHTTP:%{http_code}" -X POST "$BASE$path" \
      -H "Content-Type: application/json" \
      -d "${POST_BODY:-{}}")
  else
    response=$(curl -sw "\nHTTP:%{http_code}" "$BASE$path")
  fi
  code=$(echo "$response" | grep -oE "HTTP:[0-9]+" | tail -1 | sed 's/HTTP://')
  body=$(echo "$response" | sed '$d')

  local matched="ok"
  if [[ "$code" != "$expected_code" ]]; then
    matched="fail-code"
  elif [[ -n "$grep_pattern" ]] && ! echo "$body" | grep -qE "$grep_pattern"; then
    matched="fail-pattern"
  fi

  if [[ "$matched" == "ok" ]]; then
    PASS=$((PASS+1))
    [[ $JSON_OUTPUT -eq 0 ]] && echo -e "${color_pass}✓${color_reset} $name ${color_dim}($method $path → $code)${color_reset}"
    RESULTS+=("$(printf '{"name":"%s","ok":true,"method":"%s","path":"%s","code":%s}' "$name" "$method" "$path" "$code")")
  else
    FAIL=$((FAIL+1))
    FAILED+=("$name")
    [[ $JSON_OUTPUT -eq 0 ]] && echo -e "${color_fail}✗${color_reset} $name ${color_dim}($method $path → expected $expected_code got $code)${color_reset}"
    [[ $JSON_OUTPUT -eq 0 ]] && echo "  body: $(echo "$body" | head -c 200)"
    RESULTS+=("$(printf '{"name":"%s","ok":false,"method":"%s","path":"%s","code":%s,"expected":%s,"reason":"%s"}' \
      "$name" "$method" "$path" "$code" "$expected_code" "$matched")")
  fi
}

# ---- Pages ----
[[ $JSON_OUTPUT -eq 0 ]] && echo "=== Pages ==="
for p in "/" "/poster" "/taker" "/credit" "/leaderboard" "/agents" "/battle" "/protocol" "/onchain" "/developers" "/api-docs" "/faucet"; do
  probe "page $p" GET "$p"
done

# ---- Public API endpoints (idempotent) ----
[[ $JSON_OUTPUT -eq 0 ]] && echo ""
[[ $JSON_OUTPUT -eq 0 ]] && echo "=== Public APIs ==="
probe "version"             GET /api/version           200 '"name":"covenant"'
probe "health"              GET /api/health            200 '"checks"'
probe "openapi"             GET /api/openapi           200 '"openapi":"3.1.0"'
probe "robots.txt"          GET /robots.txt            200 'User-Agent'
probe "sitemap.xml"         GET /sitemap.xml           200 'urlset'
probe "jobs list"           GET /api/jobs              200
probe "elo leaderboard"     GET /api/elo/leaderboard   200
probe "claims list"         GET /api/claims            200
probe "claims activity"     GET /api/claims/activity   200
probe "claims stats"        GET /api/claims/stats      200
probe "claims leaderboard"  GET /api/claims/leaderboard 200
probe "events"              GET /api/events?limit=5    200
probe "agents published"    GET /api/agents/published  200
probe "arena recent"        GET "/api/arena/battle?limit=2"  200

# ---- Validation paths ----
[[ $JSON_OUTPUT -eq 0 ]] && echo ""
[[ $JSON_OUTPUT -eq 0 ]] && echo "=== Validation paths ==="
POST_BODY='{}'   probe "lookup invalid input" POST /api/jobs/lookup     400
POST_BODY='{"posterWallet":"7GpXEwNrf8BVFBGMYjuYHoSmN1FvGFQD1MTtgJk2u7fG","specHash":"0000000000000000000000000000000000000000000000000000000000000000"}' \
  probe "lookup valid"      POST /api/jobs/lookup     200 '"exists":'

# ---- Summary ----
if [[ $JSON_OUTPUT -eq 1 ]]; then
  printf '{\n  "base": "%s",\n  "pass": %d,\n  "fail": %d,\n  "results": [\n    %s\n  ]\n}\n' \
    "$BASE" "$PASS" "$FAIL" "$(IFS=,; echo "${RESULTS[*]}" | sed 's/,/,\n    /g')"
else
  echo ""
  echo "═════════════════════════════════"
  if [[ $FAIL -eq 0 ]]; then
    echo -e "  ${color_pass}PASS: $PASS${color_reset}  FAIL: $FAIL"
  else
    echo -e "  PASS: $PASS  ${color_fail}FAIL: $FAIL${color_reset}"
    echo ""
    echo "  Failed:"
    for f in "${FAILED[@]}"; do echo "    - $f"; done
  fi
  echo "═════════════════════════════════"
fi

[[ $FAIL -gt 0 ]] && exit 1
exit 0
