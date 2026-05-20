#!/usr/bin/env python3
"""
scaffold_worker.py — stage a new worker project inside the user's Workshop.

This is the script the forge invokes after the user has confirmed the spec
and the cascade is designed. It does not build the artifact — that happens
in Phase 4 of the forge cycle. This script's job is to produce a complete
project directory the user (or the forge) can then build.

Usage:
    python scaffold_worker.py \\
        --name my-worker \\
        --description "What the worker does, one paragraph." \\
        --target-os windows \\
        --trigger click \\
        --workshop ~/worker-forge-workshop \\
        --main path/to/filled-in-main.py \\
        --worker-md path/to/filled-WORKER.md \\
        --authoring-md path/to/filled-AUTHORING.md \\
        --requirements requests==2.32.3 pypdf==4.3.1 \\
        --reads "PDFs in ~/Downloads" \\
        --writes "Renamed files in place" \\
        --network "None"

Produces:
    <workshop>/workers/<name>/
        WORKER.md
        AUTHORING.md
        main.py
        worker_runtime.py
        requirements.txt
        resources/
        build/
            build_<target-os>.{bat,sh}
        dist/
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import shutil
import stat
import sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"

BUILD_SCRIPT = {
  "windows": "build_windows.bat",
  "macos": "build_macos.sh",
  "linux": "build_linux.sh",
}

ARTIFACT_EXT = {
  "windows": ".exe",
  "macos": "",
  "linux": "",
}


def slugify(s: str) -> str:
  s = re.sub(r"[^a-zA-Z0-9_-]+", "-", s.strip().lower())
  s = re.sub(r"-+", "-", s).strip("-")
  return s or "worker"


def class_name(slug: str) -> str:
  parts = re.split(r"[-_]+", slug)
  return "".join(p.capitalize() for p in parts if p) + "Worker"


def substitute(text: str, subs: dict) -> str:
  for key, value in subs.items():
    text = text.replace("{" + key + "}", value)
  return text


def main(argv: list[str]) -> int:
  p = argparse.ArgumentParser()
  p.add_argument("--name", required=True, help="Worker slug, e.g. 'pdf-renamer'.")
  p.add_argument("--description", required=True,
                 help="One-paragraph description of what the worker does.")
  p.add_argument("--target-os", required=True, choices=list(BUILD_SCRIPT),
                 help="OS the artifact runs on.")
  p.add_argument("--trigger", required=True,
                 choices=["click", "schedule", "cron", "event"],
                 help="How the worker is started.")
  p.add_argument("--workshop", required=True,
                 help="Path to the user's Workshop directory.")
  p.add_argument("--main", required=True,
                 help="Path to the filled-in main.py. If you point at "
                      "assets/main_template.py, placeholders get substituted "
                      "so the file is at least syntactically usable.")
  p.add_argument("--worker-md", required=True,
                 help="Path to the filled-in WORKER.md (or the template).")
  p.add_argument("--authoring-md", required=True,
                 help="Path to the filled-in AUTHORING.md (or the template).")
  p.add_argument("--requirements", nargs="*", default=[],
                 help="Pip requirements, one per arg, pinned versions.")
  p.add_argument("--reads", default="(none)")
  p.add_argument("--writes", default="(none)")
  p.add_argument("--network", default="(none)")
  args = p.parse_args(argv)

  slug = slugify(args.name)
  target_os = args.target_os
  build_script = BUILD_SCRIPT[target_os]
  artifact_ext = ARTIFACT_EXT[target_os]
  klass = class_name(slug)
  today = dt.date.today().isoformat()

  workshop = Path(args.workshop).expanduser().resolve()
  workers_root = workshop / "workers"
  out_dir = workers_root / slug

  if out_dir.exists():
    print(f"refusing to overwrite existing {out_dir}", file=sys.stderr)
    return 2

  # Lay out the directory.
  out_dir.mkdir(parents=True)
  (out_dir / "resources").mkdir()
  (out_dir / "build").mkdir()
  (out_dir / "dist").mkdir()
  (workshop / "forge").mkdir(exist_ok=True)

  # Shared substitution map.
  subs = {
    "WORKER_NAME": slug,
    "WORKER_CLASS": klass,
    "FORGE_DATE": today,
    "TARGET_OS": target_os,
    "TRIGGER": args.trigger,
    "BUILD_SCRIPT": build_script,
    "ARTIFACT_EXT": artifact_ext,
    "ONE_LINE_DESCRIPTION": args.description.split(".")[0].strip() + ".",
    "FULL_DESCRIPTION": args.description,
    "READS": args.reads,
    "WRITES": args.writes,
    "NETWORK": args.network,
  }

  # Runtime: copied unchanged.
  shutil.copy(ASSETS / "worker_runtime.py", out_dir / "worker_runtime.py")

  # Build script: copied unchanged into build/, with +x on Unix.
  build_src = ASSETS / build_script
  build_dst = out_dir / "build" / build_script
  shutil.copy(build_src, build_dst)
  if build_script.endswith(".sh"):
    st = os.stat(build_dst)
    os.chmod(build_dst, st.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

  # main.py: substitute placeholders so the template version compiles.
  main_text = Path(args.main).read_text(encoding="utf-8")
  main_text = substitute(main_text, subs)
  (out_dir / "main.py").write_text(main_text, encoding="utf-8")

  # WORKER.md: substitute placeholders.
  worker_md_text = Path(args.worker_md).read_text(encoding="utf-8")
  worker_md_text = substitute(worker_md_text, subs)
  (out_dir / "WORKER.md").write_text(worker_md_text, encoding="utf-8")

  # AUTHORING.md: substitute placeholders.
  authoring_md_text = Path(args.authoring_md).read_text(encoding="utf-8")
  authoring_md_text = substitute(authoring_md_text, subs)
  (out_dir / "AUTHORING.md").write_text(authoring_md_text, encoding="utf-8")

  # requirements.txt: start from the template comment block, add user reqs.
  req_text = (ASSETS / "requirements.txt").read_text(encoding="utf-8")
  if args.requirements:
    req_text += "\n" + "\n".join(args.requirements) + "\n"
  (out_dir / "requirements.txt").write_text(req_text, encoding="utf-8")

  print(f"Scaffolded worker at: {out_dir}")
  print(f"Build script:        build/{build_script}")
  print(f"Target OS:           {target_os}")
  print(f"Trigger:             {args.trigger}")
  print()
  print("Next: ask the user whether to run the build now (Phase 4).")
  return 0


if __name__ == "__main__":
  sys.exit(main(sys.argv[1:]))
