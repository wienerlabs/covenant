#!/bin/bash
# Run the unit test suite.
#
# Picks the right command based on whether node_modules is
# populated. Without npm install the dep-free tests still run
# (cache, spec); with npm install all tests run.
#
# Exit codes:
#   0  all runnable tests pass
#   1  at least one test failed

set -uo pipefail

cd "$(dirname "$0")/.."

PASS=0
FAIL=0

run_test() {
  local file="$1"
  echo "▶ $file"
  if npx --yes tsx --test "$file" 2>&1 | tail -20; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
  echo ""
}

# Always-runnable
run_test tests/unit/cache.test.ts
run_test tests/unit/spec.test.ts

# Need full deps (skip if node_modules absent)
if [ -d node_modules/@solana/web3.js ]; then
  run_test tests/unit/validate.test.ts
fi
if [ -d node_modules/next ]; then
  run_test tests/unit/api-response.test.ts
fi

echo "════════════════════════════════════"
echo "  PASS: $PASS  FAIL: $FAIL"
echo "════════════════════════════════════"
exit $FAIL
