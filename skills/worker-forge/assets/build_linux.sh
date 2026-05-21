#!/usr/bin/env bash
# ---------------------------------------------------------------------
# build_linux.sh — produce a single-file Linux binary for this worker.
#
# This script lives in build/. Run it from the worker folder:
#   bash build/build_linux.sh
#
# Requires Python 3.11+ on PATH. On Debian/Ubuntu, install via:
#   sudo apt install python3 python3-venv python3-pip
#
# Output:
#   dist/<worker-name>            (single-file Linux binary)
#
# PyInstaller binaries on Linux are not statically linked against glibc.
# A binary built on Ubuntu 24.04 may not run on RHEL 7. Build on the
# oldest Linux you need to support, or wrap with AppImage / Flatpak
# for broader portability.
# ---------------------------------------------------------------------

set -e

# Resolve the worker folder (parent of this script) and cd into it.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$WORKER_DIR"

WORKER_NAME="$(basename "$WORKER_DIR")"

echo
echo "=== Building worker: $WORKER_NAME (target: linux) ==="
echo

if [ ! -x "build/.venv/bin/python" ]; then
    echo "Creating build venv at build/.venv ..."
    python3 -m venv build/.venv
fi

# shellcheck disable=SC1091
source build/.venv/bin/activate

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

chmod +x "dist/$WORKER_NAME"

echo
echo "=== Done ==="
echo "Your worker is at: $WORKER_DIR/dist/$WORKER_NAME"
echo "Run it with:        $WORKER_DIR/dist/$WORKER_NAME"
echo
