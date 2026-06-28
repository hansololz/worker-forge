#!/usr/bin/env bash
# Unit tests: backend (pytest) + frontend (vitest), logic in isolation. Fast, no
# servers, no display.
#
#   scripts/test-unit.sh            # both
#   scripts/test-unit.sh backend    # backend only
#   scripts/test-unit.sh frontend   # frontend only
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib-test.sh
. scripts/lib-test.sh

TARGET="${1:-all}"

run_backend() {
  echo "== unit · backend (pytest tests/unit) =="
  ensure_backend_venv
  ( cd backend && .venv/bin/python -m pytest tests/unit )
}

run_frontend() {
  echo "== unit · frontend (vitest tests/unit) =="
  [ -d node_modules ] || npm install --no-audit --no-fund
  npm run test:unit
}

case "$TARGET" in
  backend)  run_backend ;;
  frontend) run_frontend ;;
  all)      run_backend; run_frontend ;;
  *) echo "usage: $0 [backend|frontend|all]" >&2; exit 2 ;;
esac
echo "✓ unit tests passed"
