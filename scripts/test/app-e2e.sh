#!/usr/bin/env bash
# App e2e tests (Playwright) — the built Electron app, which spawns its own engine.
# Runs in Docker (xvfb) by default; pass --local to run against the host display.
#
#   scripts/test/app-e2e.sh                    # docker
#   scripts/test/app-e2e.sh --local            # native (build + run)
#   scripts/test/app-e2e.sh --local --no-build # native, reuse out/
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/test/lib-test.sh
. scripts/test/lib-test.sh

MODE=docker
NO_BUILD=
for arg in "$@"; do
  case "$arg" in
    --local)    MODE=local ;;
    --no-build) NO_BUILD=1 ;;
  esac
done

if [ "$MODE" = docker ]; then
  echo "== app · e2e (docker, xvfb) =="
  $COMPOSE run --build --rm e2e
  echo "✓ app e2e tests passed (docker)"
  exit 0
fi

echo "== app · e2e (electron + playwright, local) =="
ensure_backend_venv
[ -d node_modules ] || npm install --no-audit --no-fund
# Playwright's Electron driver uses the electron in node_modules; no browser
# download needed, but make sure the package is present.
[ -d node_modules/@playwright ] || npm install --no-audit --no-fund

if [ -z "$NO_BUILD" ]; then
  echo "-- building renderer + main bundles --"
  npm run build
fi
npm run test:e2e
echo "✓ app e2e tests passed"
