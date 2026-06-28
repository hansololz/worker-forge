#!/usr/bin/env bash
# Run all engine tests (unit + integration). Thin aggregator over the per-type
# scripts; for a single type call scripts/test/engine-<type>.sh directly.
#
#   scripts/test/engine.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

scripts/test/engine-unit.sh
scripts/test/engine-integration.sh
echo "✓ all engine tests passed"
