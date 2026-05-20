#!/usr/bin/env bash
# ---------------------------------------------------------------------
# build_linux.sh — produce a single-file Linux executable for this worker.
#
# Requires Python 3.11+ available as `python3`. Install via your system
# package manager (apt, dnf, pacman, etc.).
#
# The output lands in dist/<worker-name> (relative to the worker's project
# root, not this build/ subfolder).
# ---------------------------------------------------------------------

set -euo pipefail

# cd to the worker's project root (parent of this build/ folder).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

WORKER_NAME="$(basename "$PWD")"

echo
echo "=== Building worker: $WORKER_NAME (Linux) ==="
echo

if [ ! -x ".venv/bin/python" ]; then
    echo "Creating build venv..."
    python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "Installing dependencies..."
python -m pip install --upgrade pip >/dev/null
python -m pip install -r requirements.txt
python -m pip install pyinstaller

echo "Running PyInstaller..."
pyinstaller \
    --onefile \
    --console \
    --name "$WORKER_NAME" \
    --distpath dist \
    --workpath build/pyinstaller-work \
    --specpath build/pyinstaller-work \
    main.py

echo
echo "=== Done ==="
echo "Your worker is at: $PWD/dist/$WORKER_NAME"
echo "Run it with: ./dist/$WORKER_NAME"
echo
