#!/usr/bin/env bash
#
# Generate build-assets/icon.png and build-assets/icon.icns from scratch.
# Requires Pillow (installed on demand into the backend venv) and macOS
# `sips` + `iconutil` (preinstalled).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY=backend/.venv/bin/python
[ -x "$PY" ] || PY=python3

mkdir -p build-assets

echo "==> Ensuring Pillow is available"
"$PY" -c "import PIL" 2>/dev/null || "$PY" -m pip install --quiet pillow

echo "==> Drawing icon.png (1024x1024)"
"$PY" scripts/make_icon.py build-assets/icon.png

echo "==> Building icon.icns"
ICONSET=build-assets/icon.iconset
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
sizes=(16 32 128 256 512)
for s in "${sizes[@]}"; do
  d=$((s * 2))
  sips -z "$s" "$s" build-assets/icon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z "$d" "$d" build-assets/icon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o build-assets/icon.icns
rm -rf "$ICONSET"

echo "Done: build-assets/icon.png + build-assets/icon.icns"
