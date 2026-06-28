#!/usr/bin/env bash
# Integration tests:
#   backend  — pytest tests/integration (in-process FastAPI TestClient + real runs)
#   frontend — src/api.js driven against a LIVE backend (booted here on a free port,
#              sandboxed via WORKER_FORGE_HOME, torn down on exit)
#
#   scripts/test-integration.sh           # both
#   scripts/test-integration.sh backend
#   scripts/test-integration.sh frontend
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib-test.sh
. scripts/lib-test.sh

TARGET="${1:-all}"

run_backend() {
  echo "== integration · backend (pytest tests/integration) =="
  ensure_backend_venv
  ( cd engine && .venv/bin/python -m pytest tests/integration )
}

run_frontend() {
  echo "== integration · frontend (api.js vs live backend) =="
  ensure_backend_venv
  [ -d node_modules ] || npm install --no-audit --no-fund

  local port home url pid
  port="$(free_port)"
  home="$(mktemp -d)"
  url="http://127.0.0.1:${port}/api"

  echo "-- booting backend on :$port (WORKER_FORGE_HOME=$home) --"
  ( cd engine && WORKER_FORGE_HOME="$home" .venv/bin/python run.py --host 127.0.0.1 --port "$port" ) &
  pid=$!
  # Always clean up the backend + temp dir, however we exit. `wait` reaps the
  # killed process quietly so the shell doesn't print "Terminated".
  cleanup() { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; rm -rf "$home"; }
  trap cleanup EXIT

  wait_health "$url"
  WF_BACKEND_URL="$url" npm run test:integration

  # Tear down on the success path explicitly so the script's exit status is the
  # test result, not the killed backend's; the trap covers the failure path.
  cleanup
  trap - EXIT
}

case "$TARGET" in
  backend)  run_backend ;;
  frontend) run_frontend ;;
  all)      run_backend; run_frontend ;;
  *) echo "usage: $0 [backend|frontend|all]" >&2; exit 2 ;;
esac
echo "✓ integration tests passed"
