#!/usr/bin/env bash
# App e2e tests (Playwright) — the built Electron app, which spawns its own engine.
#
#   scripts/test/app-e2e.sh             # build + run
#   scripts/test/app-e2e.sh --no-build  # skip the bundle build (reuse out/)
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/test/lib-test.sh
. scripts/test/lib-test.sh

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
echo "✓ app e2e tests passed"
