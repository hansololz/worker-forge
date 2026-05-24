#!/usr/bin/env bash
# Build script for {{WORKER_DISPLAY_NAME}} ({{WORKER_NAME}}) on Linux.
#
# Produces a single-file ELF binary in the parent workspace's dist/ folder,
# named with the display name (e.g. "My Worker"), not the slug. The display
# name is what the recipient sees in their file manager.
#
# If `appimagetool` is on PATH, also wraps it in an AppImage. Run from the
# build/ directory:
#     cd path/to/workspaces/{{WORKER_NAME}}/build
#     ./build_linux.sh
#
# Requires Python 3.10+ on PATH.

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
# --name takes the display name (quoted, may contain spaces) so the final
# binary is named the way a human would write it.
EXTRA_FLAGS=()
if [[ -d "$BUILD_DIR/../resources" ]]; then
    EXTRA_FLAGS+=(--add-data "$BUILD_DIR/../resources:resources")
fi
pyinstaller --onefile --name "$WORKER_DISPLAY_NAME" "${EXTRA_FLAGS[@]}" "$BUILD_DIR/main.py"

echo "Copying artifact to dist..."
mkdir -p "$DIST_DIR"
cp "$BUILD_DIR/dist/$WORKER_DISPLAY_NAME" "$DIST_DIR/$WORKER_DISPLAY_NAME"
chmod +x "$DIST_DIR/$WORKER_DISPLAY_NAME"

if command -v appimagetool >/dev/null 2>&1; then
    echo "appimagetool found, wrapping as AppImage..."
    APPDIR="$BUILD_DIR/AppDir"
    rm -rf "$APPDIR"
    mkdir -p "$APPDIR/usr/bin"
    # Inside the AppDir, paths use the slug (no spaces) for the binary,
    # desktop file, and icon so the AppImage internals stay shell-safe. The
    # user-facing .AppImage filename and the desktop entry Name= use the
    # display name.
    cp "$DIST_DIR/$WORKER_DISPLAY_NAME" "$APPDIR/usr/bin/$WORKER_SLUG"
    cat > "$APPDIR/$WORKER_SLUG.desktop" <<EOF
[Desktop Entry]
Name=$WORKER_DISPLAY_NAME
Exec=$WORKER_SLUG
Icon=$WORKER_SLUG
Type=Application
Categories=Utility;
EOF
    # If the workspace ships an icon at resources/icon.png, use it. Otherwise
    # skip the icon — appimagetool warns but produces a usable AppImage.
    if [[ -f "$BUILD_DIR/../resources/icon.png" ]]; then
        cp "$BUILD_DIR/../resources/icon.png" "$APPDIR/$WORKER_SLUG.png"
    fi
    ln -sf "usr/bin/$WORKER_SLUG" "$APPDIR/AppRun"
    if appimagetool "$APPDIR" "$DIST_DIR/$WORKER_DISPLAY_NAME.AppImage"; then
        chmod +x "$DIST_DIR/$WORKER_DISPLAY_NAME.AppImage"
        echo "Done. Artifacts:"
        echo "  $DIST_DIR/$WORKER_DISPLAY_NAME"
        echo "  $DIST_DIR/$WORKER_DISPLAY_NAME.AppImage"
    else
        echo "appimagetool failed; keeping plain binary."
        echo "Done. Artifact: $DIST_DIR/$WORKER_DISPLAY_NAME"
    fi
else
    echo "Done. Artifact: $DIST_DIR/$WORKER_DISPLAY_NAME"
    echo "(Install appimagetool to also build an AppImage.)"
fi
