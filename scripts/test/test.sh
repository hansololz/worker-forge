#!/usr/bin/env bash
# Umbrella test runner — fans out to the per-(component,type) scripts, or to
# Docker. Each script runs exactly one component + one type; this is the only
# place that runs several together.
#
#   scripts/test/test.sh [engine|app|all] [--docker]
#
# Local (default): runs the matching scripts/test/<component>-<type>.sh scripts.
# --docker: runs the same suites in containers (docker/docker-compose.test.yml).
set -euo pipefail
cd "$(dirname "$0")/../.."

TYPE="${1:-all}"
MODE="local"
for arg in "$@"; do [ "$arg" = "--docker" ] && MODE="docker"; done

COMPOSE="docker compose -f docker/docker-compose.test.yml"

if [ "$MODE" = "docker" ]; then
  case "$TYPE" in
    # engine image runs pytest unit+integration; app = frontend unit + e2e.
    engine) $COMPOSE run --rm backend-tests ;;
    app)    $COMPOSE run --rm frontend-tests && $COMPOSE run --rm e2e ;;
    all)    $COMPOSE run --rm backend-tests && $COMPOSE run --rm frontend-tests && $COMPOSE run --rm e2e ;;
    *) echo "usage: $0 [engine|app|all] [--docker]" >&2; exit 2 ;;
  esac
  exit 0
fi

case "$TYPE" in
  engine) scripts/test/engine.sh ;;
  app)    scripts/test/app.sh ;;
  all)    scripts/test/engine.sh && scripts/test/app.sh ;;
  *) echo "usage: $0 [engine|app|all] [--docker]" >&2; exit 2 ;;
esac
