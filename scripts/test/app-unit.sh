#!/usr/bin/env bash
# App unit tests (vitest) — frontend logic in isolation, mocked fetch, jsdom.
#
#   scripts/test/app-unit.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "== app · unit (vitest tests/unit) =="
[ -d node_modules ] || npm install --no-audit --no-fund
npm run test:unit
echo "✓ app unit tests passed"
