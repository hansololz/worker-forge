#!/usr/bin/env bash
# Umbrella test runner — fans out to the per-component aggregators. Unit suites
# run natively; integration + e2e run in Docker by default. Pass --local to run
# everything natively (and --no-build to reuse out/ for a native e2e).
#
#   scripts/test/test.sh [engine|app|all] [--local] [--no-build]
set -euo pipefail
cd "$(dirname "$0")/../.."

TYPE="all"
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then TYPE="$1"; shift; fi

case "$TYPE" in
  engine) scripts/test/engine.sh "$@" ;;
  app)    scripts/test/app.sh "$@" ;;
  all)    scripts/test/engine.sh "$@" && scripts/test/app.sh "$@" ;;
  *) echo "usage: $0 [engine|app|all] [--local] [--no-build]" >&2; exit 2 ;;
esac
