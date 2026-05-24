#!/usr/bin/env bash
# Build script for {{WORKER_DISPLAY_NAME}} ({{WORKER_NAME}}) on macOS.
#
# Produces a single-file artifact in the parent workspace's dist/ folder,
# named with the display name (e.g. "My Worker.app" / "My Worker"), not the
# slug. The display name is what the recipient sees in Finder.
#
# For a GUI worker the artifact is an .app bundle; for a CLI worker it's a
# plain executable. Run from the build/ directory:
#     cd path/to/workspaces/{{WORKER_NAME}}/build
#     ./build_macos.sh
#
# Requires Python 3.10+ on PATH.
#
# Unsigned artifacts trigger Gatekeeper on first launch. The recipient can
# right-click → Open the first time to bypass; mention this in WORKER.md.

set -euo pipefail

WORKER_SLUG="{{WORKER_NAME}}"
WORKER_DISPLAY_NAME="{{WORKER_DISPLAY_NAME}}"
BUILD_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$BUILD_DIR/../dist"

echo "Creating venv..."
python3 -m venv "$BUILD_DIR/.venv"

# shellcheck disable=SC1091
source "$BUILD_DIR/.venv/bin/activate"

echo "Installing dependencies..."
python -m pip install --upgrade pip
python -m pip install -r "$BUILD_DIR/requirements.txt" pyinstaller

echo "Building executable..."
# --windowed bundles a .app for GUI workers; omit for CLI workers.
# --name takes the display name (quoted, may contain spaces) so the .app
# bundle or CLI binary is named the way a human would write it.
# The forge sets WORKER_GUI=1 at code-gen time if the worker has a GUI.
EXTRA_FLAGS=()
if [[ "${WORKER_GUI:-0}" == "1" ]]; then
    EXTRA_FLAGS+=(--windowed)
fi
if [[ -d "$BUILD_DIR/../resources" ]]; then
    EXTRA_FLAGS+=(--add-data "$BUILD_DIR/../resources:resources")
fi
# If the workspace ships an icon, embed it. PyInstaller wants .icns on macOS;
# fall back to PNG (PyInstaller converts) if no .icns is provided.
if [[ -f "$BUILD_DIR/../resources/icon.icns" ]]; then
    EXTRA_FLAGS+=(--icon "$BUILD_DIR/../resources/icon.icns")
elif [[ -f "$BUILD_DIR/../resources/icon.png" ]]; then
    EXTRA_FLAGS+=(--icon "$BUILD_DIR/../resources/icon.png")
fi
pyinstaller --onefile --name "$WORKER_DISPLAY_NAME" "${EXTRA_FLAGS[@]}" "$BUILD_DIR/main.py"

echo "Copying artifact to dist..."
mkdir -p "$DIST_DIR"
if [[ -d "$BUILD_DIR/dist/$WORKER_DISPLAY_NAME.app" ]]; then
    rm -rf "$DIST_DIR/$WORKER_DISPLAY_NAME.app"
    cp -R "$BUILD_DIR/dist/$WORKER_DISPLAY_NAME.app" "$DIST_DIR/$WORKER_DISPLAY_NAME.app"
    echo "Done. Artifact: $DIST_DIR/$WORKER_DISPLAY_NAME.app"
else
    cp "$BUILD_DIR/dist/$WORKER_DISPLAY_NAME" "$DIST_DIR/$WORKER_DISPLAY_NAME"
    chmod +x "$DIST_DIR/$WORKER_DISPLAY_NAME"
    echo "Done. Artifact: $DIST_DIR/$WORKER_DISPLAY_NAME"
fi
