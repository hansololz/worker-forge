#!/usr/bin/env bash
# Engine integration tests (Python / pytest) — FastAPI TestClient + real bash
# subprocess runs. Runs in Docker by default; pass --local to run natively.
#
#   scripts/test/engine-integration.sh           # docker
#   scripts/test/engine-integration.sh --local   # native
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/test/lib-test.sh
. scripts/test/lib-test.sh

if [ "${1:-}" != "--local" ]; then
  echo "== engine · integration (docker) =="
  $COMPOSE run --rm backend-tests pytest tests/integration
  echo "✓ engine integration tests passed (docker)"
  exit 0
fi

echo "== engine · integration (pytest tests/integration, local) =="
ensure_backend_venv
( cd engine && .venv/bin/python -m pytest tests/integration )
echo "✓ engine integration tests passed"
