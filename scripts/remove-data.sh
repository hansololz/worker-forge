#!/usr/bin/env bash
#
# Remove worker-forge's local app data.
#   * Per-user config dir (config.json, agent.db, the default data/ YAML tree),
#     resolved exactly like engine/app/paths.py:_config_dir().
#   * The $WORKER_FORGE_HOME data directory, when set.
#
# Usage:
#   bash scripts/remove-data.sh        # prompt before deleting
#   bash scripts/remove-data.sh -y     # skip the confirmation
#
set -euo pipefail

ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help)
      sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "remove-data: unknown argument '$arg' (try --help)" >&2; exit 2 ;;
  esac
done

rm_path() {  # rm_path <label> <path>
  if [ -e "$2" ]; then
    echo "    removing $1: $2"
    rm -rf "$2"
  fi
}

# Per-user config dir — mirrors paths.py:_config_dir().
case "$(uname -s)" in
  Darwin) CONFIG_DIR="$HOME/Library/Application Support/Worker Forge" ;;
  Linux)  CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/worker-forge" ;;
  *)      CONFIG_DIR="${APPDATA:-$HOME/AppData/Roaming}/Worker Forge" ;;
esac

# Targets: the config dir (holds config.json + default data/ tree) and, if
# the dev session pointed elsewhere, the $WORKER_FORGE_HOME data directory.
APP_TARGETS=("$CONFIG_DIR")
[ -n "${WORKER_FORGE_HOME:-}" ] && APP_TARGETS+=("$WORKER_FORGE_HOME")

echo "==> App data"
EXISTING=()
for t in "${APP_TARGETS[@]}"; do
  [ -e "$t" ] && EXISTING+=("$t")
done

if [ "${#EXISTING[@]}" -eq 0 ]; then
  echo "    nothing to remove (no app data found)"
  exit 0
fi

if [ "$ASSUME_YES" -ne 1 ]; then
  echo "    This permanently deletes:"
  for t in "${EXISTING[@]}"; do echo "      - $t"; done
  read -r -p "    Proceed? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "    aborted; app data left untouched"; exit 0 ;;
  esac
fi

for t in "${EXISTING[@]}"; do
  rm_path "app data" "$t"
done

echo "Done."
