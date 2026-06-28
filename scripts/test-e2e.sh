#!/usr/bin/env bash
# End-to-end tests: the built Electron app, driven by Playwright. The app spawns
# the real Python backend itself; this script just builds the bundles and runs
# the suite.
#
# Linux CI runs this under xvfb inside docker/e2e.Dockerfile. On macOS it runs
# against the host display. Either way it needs a runnable backend
# (backend/.venv or python3 on PATH) — ensured below.
#
#   scripts/test-e2e.sh             # build + run
#   scripts/test-e2e.sh --no-build  # skip the bundle build (reuse out/)
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/lib-test.sh
. scripts/lib-test.sh

echo "== e2e · electron (playwright) =="
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
echo "✓ e2e tests passed"
