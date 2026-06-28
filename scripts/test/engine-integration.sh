#!/usr/bin/env bash
# Engine integration tests (Python / pytest) — FastAPI TestClient + real bash
# subprocess runs, all in-process. No app tooling.
#
#   scripts/test/engine-integration.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/test/lib-test.sh
. scripts/test/lib-test.sh

echo "== engine · integration (pytest tests/integration) =="
ensure_backend_venv
( cd engine && .venv/bin/python -m pytest tests/integration )
echo "✓ engine integration tests passed"
