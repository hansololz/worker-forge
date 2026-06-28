#!/usr/bin/env bash
# Run all app tests (unit + integration + e2e). Thin aggregator over the per-type
# scripts; for a single type call scripts/test/app-<type>.sh directly.
#
#   scripts/test/app.sh             # build + run e2e
#   scripts/test/app.sh --no-build  # forwarded to the e2e step (reuse out/)
set -euo pipefail
cd "$(dirname "$0")/../.."

scripts/test/app-unit.sh
scripts/test/app-integration.sh
scripts/test/app-e2e.sh "$@"
echo "✓ all app tests passed"
