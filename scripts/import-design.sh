#!/usr/bin/env bash
#
# Import a design bundle from ../workflow.zip (repo parent dir) into the project design/ dir.
#   * Unzips ../workflow.zip into a temp dir.
#   * Locates the bundle files inside the archive — they may sit at the archive
#     root or nested inside a wrapper / a "design" folder; either way the files
#     are flattened out so the bundle (styles.css, *.jsx, *.js, README.md, …)
#     lands directly in design/.
#   * Copies them into design/, overwriting matching files (other files kept).
#
# Usage:
#   bash scripts/import-design.sh        # imports straight away, no prompt
#
set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "import-design: unknown argument '$arg' (try --help)" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DESIGN_DIR="$ROOT/design"
ZIP="$ROOT/../workflow.zip"

command -v unzip >/dev/null 2>&1 || { echo "import-design: 'unzip' not found on PATH" >&2; exit 1; }
[ -f "$ZIP" ] || { echo "import-design: no archive found at $ZIP" >&2; exit 1; }

# Extract into a scratch dir that is always cleaned up.
TMP="$(mktemp -d "${TMPDIR:-/tmp}/import-design.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

echo "==> Unzipping $ZIP"
unzip -q -o "$ZIP" -d "$TMP"

# Drop macOS archive cruft so it can't confuse the wrapper detection or get copied.
find "$TMP" -name '__MACOSX' -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$TMP" -name '.DS_Store' -type f -delete 2>/dev/null || true

# Resolve where the bundle actually lives: peel off any single-directory wrapper
# layers (e.g. a "workflow/" or "design/" folder the files were zipped inside).
SRC="$TMP"
while :; do
  entries=$(ls -A "$SRC")
  [ "$(printf '%s\n' "$entries" | grep -c .)" -eq 1 ] || break   # stop once >1 entry
  only="$entries"
  [ -d "$SRC/$only" ] || break                                  # stop if it's a file
  SRC="$SRC/$only"
done

# Sanity: make sure we found something to import.
if [ -z "$(ls -A "$SRC")" ]; then
  echo "import-design: archive contained no files" >&2
  exit 1
fi

FILE_COUNT=$(find "$SRC" -type f | wc -l | tr -d ' ')
echo "==> Found $FILE_COUNT file(s) to import"
[ "$SRC" != "$TMP" ] && echo "    (flattened out of: ${SRC#"$TMP"/})"

mkdir -p "$DESIGN_DIR"
# Copy contents (including dotfiles) into design/, overwriting in place.
cp -R "$SRC"/. "$DESIGN_DIR"/

# Clean up: drop the extracted temp dir and the source archive.
rm -rf "$TMP"
rm -f "$ZIP"

echo "Done. Imported $FILE_COUNT file(s) into design/; removed the extract and workflow.zip."

git add -A
git commit -am "Updated design"
