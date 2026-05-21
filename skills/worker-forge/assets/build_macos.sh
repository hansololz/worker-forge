#!/usr/bin/env bash
# ---------------------------------------------------------------------
# build_macos.sh — produce a single-file macOS artifact for this worker.
#
# This script lives in build/. Run it from the worker folder:
#   bash build/build_macos.sh
#
# Requires Python 3.11+ on PATH. Install from https://python.org or via
# Homebrew if not already installed.
#
# Output:
#   dist/<worker-name>            (Unix executable)
#   dist/<worker-name>.app        (macOS bundle, if --windowed worked)
#
# This template uses --console (a Terminal window opens on run) so the
# worker can prompt for an API key on first run. Swap to --windowed if
# the worker has no LOCAL/HOSTED tiers and never prompts.
# ---------------------------------------------------------------------

set -e

# Resolve the worker folder (parent of this script) and cd into it.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$WORKER_DIR"

WORKER_NAME="$(basename "$WORKER_DIR")"

echo
echo "=== Building worker: $WORKER_NAME (target: macos) ==="
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

echo
echo "=== Done ==="
echo "Your worker is at: $WORKER_DIR/dist/$WORKER_NAME"
echo
echo "Note on Gatekeeper: the first time you run this binary, macOS may"
echo "show 'cannot be opened because the developer cannot be verified.'"
echo "Right-click the file in Finder and choose Open to approve it once."
echo
