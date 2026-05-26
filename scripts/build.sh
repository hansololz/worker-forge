#!/usr/bin/env bash
# build.sh — build the worker-forge.skill distributable.
#
# A .skill file is a zip archive of a skill directory, with SKILL.md at the
# archive root. This script zips skills/worker-forge/ into dist/worker-forge.skill,
# replacing any existing build.
#
# Usage:
#   ./scripts/build.sh        (from the repo root)
#   ./build.sh                (from inside scripts/)

set -euo pipefail

# Resolve the repo root. This script lives in scripts/, so the repo root is one
# level up. Using ${BASH_SOURCE[0]} (not $0) and cd-ing in a subshell lets the
# script be invoked from any cwd or via an absolute path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_SRC="$REPO_ROOT/skills/worker-forge"
DIST_DIR="$REPO_ROOT/dist"
OUT_FILE="$DIST_DIR/worker-forge.skill"

# Sanity-check the source layout.
if [[ ! -d "$SKILL_SRC" ]]; then
  echo "error: skill source not found at $SKILL_SRC" >&2
  exit 1
fi
if [[ ! -f "$SKILL_SRC/SKILL.md" ]]; then
  echo "error: $SKILL_SRC is missing SKILL.md — not a valid skill directory" >&2
  exit 1
fi

# zip is part of base on macOS and Linux. Bail with a clear message if it's missing.
if ! command -v zip >/dev/null 2>&1; then
  echo "error: zip is not installed. Install it (apt install zip / brew install zip) and retry." >&2
  exit 1
fi

mkdir -p "$DIST_DIR"

# Replace any existing build.
if [[ -f "$OUT_FILE" ]]; then
  echo "removing existing $OUT_FILE"
  rm -f "$OUT_FILE"
fi

echo "building $OUT_FILE from $SKILL_SRC"

# Zip from inside the skill directory so SKILL.md sits at the archive root.
# Exclusions: Python bytecode, OS junk, editor temp files, anything that would
# bloat the archive or leak local state.
(
  cd "$SKILL_SRC"
  zip -r "$OUT_FILE" . \
    -x "*/__pycache__/*" \
    -x "__pycache__/*" \
    -x "*.pyc" \
    -x "*.pyo" \
    -x ".DS_Store" \
    -x "*/.DS_Store" \
    -x ".idea/*" \
    -x "*/.idea/*" \
    -x ".vscode/*" \
    -x "*/.vscode/*" \
    -x "*.swp" \
    -x "*~"
) >/dev/null

# Quick sanity check on the artifact: SKILL.md must be at the archive root.
# `unzip -p` writes the named entry to stdout and exits non-zero if it isn't
# present at that path — more reliable than parsing `unzip -l` output, which
# varies across platforms.
if ! unzip -p "$OUT_FILE" SKILL.md >/dev/null 2>&1; then
  echo "error: built archive is missing SKILL.md at its root" >&2
  exit 1
fi

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo "built $OUT_FILE ($SIZE)"
