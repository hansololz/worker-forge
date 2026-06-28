#!/usr/bin/env bash
# App tests (frontend + Electron) only — no engine pytest suite. Layers:
#   unit        — vitest, logic in isolation (mocked fetch), jsdom
#   integration — api.js driven against a live engine booted here as a black-box
#                 fixture (sandboxed WORKER_FORGE_HOME, torn down on exit)
#   e2e         — Playwright over the built Electron app (which spawns its own engine)
#
#   scripts/test/app.sh                 # unit + integration + e2e
#   scripts/test/app.sh unit
#   scripts/test/app.sh integration
#   scripts/test/app.sh e2e [--no-build]
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/test/lib-test.sh
. scripts/test/lib-test.sh

TARGET="${1:-all}"

run_unit() {
  echo "== app · unit (vitest tests/unit) =="
  [ -d node_modules ] || npm install --no-audit --no-fund
  npm run test:unit
}

run_integration() {
  echo "== app · integration (api.js vs live engine) =="
  ensure_backend_venv
  [ -d node_modules ] || npm install --no-audit --no-fund

  local port home url pid
  port="$(free_port)"
  home="$(mktemp -d)"
  url="http://127.0.0.1:${port}/api"

  echo "-- booting engine on :$port (WORKER_FORGE_HOME=$home) --"
  ( cd engine && WORKER_FORGE_HOME="$home" .venv/bin/python run.py --host 127.0.0.1 --port "$port" ) &
  pid=$!
  # Always clean up the engine + temp dir, however we exit. `wait` reaps the
  # killed process quietly so the shell doesn't print "Terminated".
  cleanup() { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; rm -rf "$home"; }
  trap cleanup EXIT

  wait_health "$url"
  WF_BACKEND_URL="$url" npm run test:integration

  # Tear down on the success path explicitly so the script's exit status is the
  # test result, not the killed engine's; the trap covers the failure path.
  cleanup
  trap - EXIT
}

run_e2e() {
  echo "== app · e2e (electron + playwright) =="
  ensure_backend_venv
  [ -d node_modules ] || npm install --no-audit --no-fund
  # Playwright's Electron driver uses the electron in node_modules; no browser
  # download needed, but make sure the package is present.
  [ -d node_modules/@playwright ] || npm install --no-audit --no-fund

  if [ "${1:-}" != "--no-build" ]; then
    echo "-- building renderer + main bundles --"
    npm run build
  fi
  npm run test:e2e
}

case "$TARGET" in
  unit)        run_unit ;;
  integration) run_integration ;;
  e2e)         run_e2e "${2:-}" ;;
  all)         run_unit; run_integration; run_e2e ;;
  *) echo "usage: $0 [unit|integration|e2e|all]" >&2; exit 2 ;;
esac
echo "✓ app tests passed"
