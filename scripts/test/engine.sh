#!/usr/bin/env bash
# Engine tests (Python / pytest) only — no app/frontend tooling. Both layers run
# in-process: unit is pure logic; integration uses FastAPI's TestClient + real
# bash subprocess steps.
#
#   scripts/test/engine.sh              # unit + integration
#   scripts/test/engine.sh unit
#   scripts/test/engine.sh integration
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/test/lib-test.sh
. scripts/test/lib-test.sh

TARGET="${1:-all}"

run_unit() {
  echo "== engine · unit (pytest tests/unit) =="
  ensure_backend_venv
  ( cd engine && .venv/bin/python -m pytest tests/unit )
}

run_integration() {
  echo "== engine · integration (pytest tests/integration) =="
  ensure_backend_venv
  ( cd engine && .venv/bin/python -m pytest tests/integration )
}

case "$TARGET" in
  unit)        run_unit ;;
  integration) run_integration ;;
  all)         run_unit; run_integration ;;
  *) echo "usage: $0 [unit|integration|all]" >&2; exit 2 ;;
esac
echo "✓ engine tests passed"
