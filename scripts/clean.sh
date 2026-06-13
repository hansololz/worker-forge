#!/usr/bin/env bash
#
# Wipe agent-dave's build/dist artifacts (out/, dist/, backend/build/, backend/dist/),
# then remove dev app data by delegating to remove-data.sh (unless --dist).
#
# Usage:
#   bash scripts/clean.sh            # clean dist artifacts + dev app data (prompts before app data)
#   bash scripts/clean.sh -y         # skip the app-data confirmation
#   bash scripts/clean.sh --dist     # only build/dist artifacts (never touches app data)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ASSUME_YES=0
DIST_ONLY=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --dist|--dist-only) DIST_ONLY=1 ;;
    -h|--help)
      sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "clean: unknown argument '$arg' (try --help)" >&2; exit 2 ;;
  esac
done

rm_path() {  # rm_path <label> <path>
  if [ -e "$2" ]; then
    echo "    removing $1: $2"
    rm -rf "$2"
  fi
}

echo "==> Build/dist artifacts"
rm_path "electron bundles" "out"
rm_path "packaged app"     "dist"
rm_path "backend build"    "backend/build"
rm_path "backend binary"   "backend/dist"

[ "$DIST_ONLY" -eq 1 ] && { echo "Done (dist only)."; exit 0; }

# App data lives outside the repo; remove-data.sh owns it (prompts unless -y).
if [ "$ASSUME_YES" -eq 1 ]; then
  exec bash "$ROOT/scripts/remove-data.sh" -y
else
  exec bash "$ROOT/scripts/remove-data.sh"
fi
