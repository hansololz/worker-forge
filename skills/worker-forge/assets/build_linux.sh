#!/usr/bin/env bash
# Build script for {{WORKER_NAME}} on Linux.
#
# Produces a single-file ELF binary in the parent workshop's dist/ folder.
# If `appimagetool` is on PATH, also wraps it in an AppImage. Run from the
# build/ directory:
#     cd path/to/workshops/{{WORKER_NAME}}/build
#     ./build_linux.sh
#
# Requires Python 3.10+ on PATH.

set -euo pipefail

WORKER_NAME="{{WORKER_NAME}}"
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
EXTRA_FLAGS=()
if [[ -d "$BUILD_DIR/../resources" ]]; then
    EXTRA_FLAGS+=(--add-data "$BUILD_DIR/../resources:resources")
fi
pyinstaller --onefile --name "$WORKER_NAME" "${EXTRA_FLAGS[@]}" "$BUILD_DIR/main.py"

echo "Copying artifact to dist..."
mkdir -p "$DIST_DIR"
cp "$BUILD_DIR/dist/$WORKER_NAME" "$DIST_DIR/$WORKER_NAME"
chmod +x "$DIST_DIR/$WORKER_NAME"

if command -v appimagetool >/dev/null 2>&1; then
    echo "appimagetool found, wrapping as AppImage..."
    APPDIR="$BUILD_DIR/AppDir"
    rm -rf "$APPDIR"
    mkdir -p "$APPDIR/usr/bin"
    cp "$DIST_DIR/$WORKER_NAME" "$APPDIR/usr/bin/$WORKER_NAME"
    cat > "$APPDIR/$WORKER_NAME.desktop" <<EOF
[Desktop Entry]
Name=$WORKER_NAME
Exec=$WORKER_NAME
Icon=$WORKER_NAME
Type=Application
Categories=Utility;
EOF
    # If the workshop ships an icon at resources/icon.png, use it. Otherwise
    # skip the icon — appimagetool warns but produces a usable AppImage.
    if [[ -f "$BUILD_DIR/../resources/icon.png" ]]; then
        cp "$BUILD_DIR/../resources/icon.png" "$APPDIR/$WORKER_NAME.png"
    fi
    ln -sf "usr/bin/$WORKER_NAME" "$APPDIR/AppRun"
    if appimagetool "$APPDIR" "$DIST_DIR/$WORKER_NAME.AppImage"; then
        chmod +x "$DIST_DIR/$WORKER_NAME.AppImage"
        echo "Done. Artifacts:"
        echo "  $DIST_DIR/$WORKER_NAME"
        echo "  $DIST_DIR/$WORKER_NAME.AppImage"
    else
        echo "appimagetool failed; keeping plain binary."
        echo "Done. Artifact: $DIST_DIR/$WORKER_NAME"
    fi
else
    echo "Done. Artifact: $DIST_DIR/$WORKER_NAME"
    echo "(Install appimagetool to also build an AppImage.)"
fi
