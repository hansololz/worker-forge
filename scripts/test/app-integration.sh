#!/usr/bin/env bash
# App integration test (vitest) — api.js driven against a live engine booted as a
# black-box fixture (sandboxed WORKER_FORGE_HOME, torn down on exit). Runs in
# Docker by default; pass --local to run natively.
#
#   scripts/test/app-integration.sh           # docker
#   scripts/test/app-integration.sh --local   # native
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/test/lib-test.sh
. scripts/test/lib-test.sh

if [ "${1:-}" != "--local" ]; then
  echo "== app · integration (docker) =="
  # Reuse the e2e image (node + python + engine venv) and run this same script
  # natively inside it — self-contained: boots the engine and runs vitest.
  $COMPOSE run --rm e2e bash scripts/test/app-integration.sh --local
  echo "✓ app integration tests passed (docker)"
  exit 0
fi

echo "== app · integration (api.js vs live engine, local) =="
ensure_backend_venv
[ -d node_modules ] || npm install --no-audit --no-fund

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
echo "✓ app integration tests passed"
