#!/usr/bin/env bash
# Build script for {{WORKER_DISPLAY_NAME}} ({{WORKER_NAME}}) on macOS.
#
# Produces a single-file artifact in this folder's dist/ subdirectory,
# named with the display name (e.g. "My Worker.app" / "My Worker"), not the
# slug. The display name is what the recipient sees in Finder.
#
# For a GUI worker the artifact is an .app bundle; for a CLI worker it's a
# plain executable. Run from the mac/ directory inside the workspace:
#     cd path/to/workspaces/{{WORKER_NAME}}/mac
#     ./build_macos.sh
#
# Requires Python 3.10+ on PATH.
#
# Unsigned artifacts trigger Gatekeeper on first launch. The recipient can
# right-click → Open the first time to bypass; mention this in WORKER.md.

set -euo pipefail

WORKER_SLUG="{{WORKER_NAME}}"
WORKER_DISPLAY_NAME="{{WORKER_DISPLAY_NAME}}"
OS_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$OS_DIR/dist"

echo "Creating venv..."
python3 -m venv "$OS_DIR/.venv"

# shellcheck disable=SC1091
source "$OS_DIR/.venv/bin/activate"

echo "Installing dependencies..."
python -m pip install --upgrade pip
python -m pip install -r "$OS_DIR/requirements.txt" pyinstaller

echo "Building executable..."
# --windowed bundles a .app for GUI workers; omit for CLI workers.
# --name takes the display name (quoted, may contain spaces) so the .app
# bundle or CLI binary is named the way a human would write it.
# The forge sets WORKER_GUI=1 at code-gen time if the worker has a GUI.
EXTRA_FLAGS=()
if [[ "${WORKER_GUI:-0}" == "1" ]]; then
    EXTRA_FLAGS+=(--windowed)
fi
if [[ -d "$OS_DIR/resources" ]]; then
    EXTRA_FLAGS+=(--add-data "$OS_DIR/resources:resources")
fi
# If the OS folder ships an icon, embed it. PyInstaller wants .icns on macOS;
# fall back to PNG (PyInstaller converts) if no .icns is provided.
if [[ -f "$OS_DIR/resources/icon.icns" ]]; then
    EXTRA_FLAGS+=(--icon "$OS_DIR/resources/icon.icns")
elif [[ -f "$OS_DIR/resources/icon.png" ]]; then
    EXTRA_FLAGS+=(--icon "$OS_DIR/resources/icon.png")
fi
# Run PyInstaller with explicit dist/work/spec paths so its scratch files
# stay inside .pyinstaller/ and the final artifact lands directly in dist/.
PYI_WORK="$OS_DIR/.pyinstaller"
rm -rf "$PYI_WORK"
mkdir -p "$PYI_WORK"
pyinstaller --onefile --name "$WORKER_DISPLAY_NAME" \
    --distpath "$DIST_DIR" --workpath "$PYI_WORK/build" --specpath "$PYI_WORK" \
    "${EXTRA_FLAGS[@]}" "$OS_DIR/main.py"

if [[ -d "$DIST_DIR/$WORKER_DISPLAY_NAME.app" ]]; then
    echo "Done. Artifact: $DIST_DIR/$WORKER_DISPLAY_NAME.app"
else
    chmod +x "$DIST_DIR/$WORKER_DISPLAY_NAME"
    echo "Done. Artifact: $DIST_DIR/$WORKER_DISPLAY_NAME"
fi
