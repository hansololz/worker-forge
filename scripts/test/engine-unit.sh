#!/usr/bin/env bash
# Engine unit tests (Python / pytest) — pure logic, in isolation. No app tooling.
#
#   scripts/test/engine-unit.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/test/lib-test.sh
. scripts/test/lib-test.sh

echo "== engine · unit (pytest tests/unit) =="
ensure_backend_venv
( cd engine && .venv/bin/python -m pytest tests/unit )
echo "✓ engine unit tests passed"
