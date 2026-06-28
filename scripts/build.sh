#!/usr/bin/env bash
#
# Build the macOS distribution into ./dist
#   1. freeze the Python backend into a single binary (PyInstaller)
#   2. build the Electron main/preload/renderer bundles (electron-vite)
#   3. package the .dmg / .zip app (electron-builder)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="${PYTHON:-python3.12}"
if ! command -v "$PY" >/dev/null 2>&1; then
  PY=python3
fi

echo "==> [1/4] Backend virtualenv + deps (using $PY)"
if [ ! -d engine/.venv ]; then
  "$PY" -m venv engine/.venv
fi
engine/.venv/bin/python -m pip install --quiet --upgrade pip
engine/.venv/bin/python -m pip install --quiet \
  -r engine/requirements.txt -r engine/requirements-dev.txt

echo "==> [2/4] Freezing backend with PyInstaller"
rm -rf engine/build engine/dist
( cd backend && .venv/bin/pyinstaller --noconfirm --clean worker-forge-backend.spec )

echo "==> [3/4] Node deps + electron-vite build"
if [ ! -d node_modules ]; then
  npm install
fi
npm run build

echo "==> [4/4] Packaging macOS app with electron-builder"
if [ ! -f build-assets/icon.icns ]; then
  echo "    (generating app icon)"
  bash scripts/make_icon.sh
fi
npm run pack:mac

echo ""
echo "Done. Distribution artifacts are in ./dist"
