#!/usr/bin/env bash
#
# Run worker-forge in development.
# Bootstraps the backend virtualenv + node deps, then launches electron-vite
# with hot reload. Electron's main process spawns the backend automatically
# (from engine/.venv), picking a free loopback port.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Pick a Python 3.12+ interpreter.
PY="${PYTHON:-python3.12}"
if ! command -v "$PY" >/dev/null 2>&1; then
  PY=python3
fi

echo "==> Backend virtualenv (using $PY)"
if [ ! -d engine/.venv ]; then
  "$PY" -m venv engine/.venv
fi
engine/.venv/bin/python -m pip install --quiet --upgrade pip
engine/.venv/bin/python -m pip install --quiet -r engine/requirements.txt

echo "==> Node dependencies"
if [ ! -d node_modules ]; then
  npm install
fi

echo "==> Launching worker-forge (dev)"
npm run dev
