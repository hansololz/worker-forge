#!/usr/bin/env bash
# Run all engine tests (unit + integration). Thin aggregator over the per-type
# scripts; for a single type call scripts/test/engine-<type>.sh directly.
# Integration runs in Docker by default; pass --local to run everything natively.
#
#   scripts/test/engine.sh
#   scripts/test/engine.sh --local
set -euo pipefail
cd "$(dirname "$0")/../.."

scripts/test/engine-unit.sh
scripts/test/engine-integration.sh "$@"
echo "✓ all engine tests passed"
