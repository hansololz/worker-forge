#!/usr/bin/env bash
# Run all app tests (unit + integration + e2e). Thin aggregator over the per-type
# scripts; for a single type call scripts/test/app-<type>.sh directly.
# Integration + e2e run in Docker by default; pass --local to run everything
# natively (then --no-build can be added to reuse out/ for e2e).
#
#   scripts/test/app.sh                     # unit native; integration + e2e docker
#   scripts/test/app.sh --local             # everything native
#   scripts/test/app.sh --local --no-build  # native, reuse out/ for e2e
set -euo pipefail
cd "$(dirname "$0")/../.."

scripts/test/app-unit.sh
scripts/test/app-integration.sh "$@"
scripts/test/app-e2e.sh "$@"
echo "✓ all app tests passed"
