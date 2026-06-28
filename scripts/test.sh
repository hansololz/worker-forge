#!/usr/bin/env bash
# Umbrella test runner — dispatches to the per-type scripts, or to Docker.
#
#   scripts/test.sh [unit|integration|e2e|all] [--docker]
#
# Local (default): runs the matching scripts/test-<type>.sh.
# --docker: runs the same layers in containers (docker/docker-compose.test.yml).
set -euo pipefail
cd "$(dirname "$0")/.."

TYPE="${1:-all}"
MODE="local"
for arg in "$@"; do [ "$arg" = "--docker" ] && MODE="docker"; done

COMPOSE="docker compose -f docker/docker-compose.test.yml"

if [ "$MODE" = "docker" ]; then
  case "$TYPE" in
    # backend image runs unit+integration together (in-process); frontend image
    # runs unit; e2e image runs playwright under xvfb.
    unit)        $COMPOSE run --rm frontend-tests && $COMPOSE run --rm backend-tests ;;
    integration) $COMPOSE run --rm backend-tests ;;
    e2e)         $COMPOSE run --rm e2e ;;
    all)         $COMPOSE run --rm backend-tests && $COMPOSE run --rm frontend-tests && $COMPOSE run --rm e2e ;;
    *) echo "usage: $0 [unit|integration|e2e|all] [--docker]" >&2; exit 2 ;;
  esac
  exit 0
fi

case "$TYPE" in
  unit)        scripts/test-unit.sh ;;
  integration) scripts/test-integration.sh ;;
  e2e)         scripts/test-e2e.sh ;;
  all)         scripts/test-unit.sh && scripts/test-integration.sh && scripts/test-e2e.sh ;;
  *) echo "usage: $0 [unit|integration|e2e|all] [--docker]" >&2; exit 2 ;;
esac
