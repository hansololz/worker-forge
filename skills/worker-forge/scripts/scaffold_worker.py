#!/usr/bin/env python3
"""
scaffold_worker.py — stage a new worker project from the skill's templates.

This is the script the forge invokes after the user has confirmed the spec
and the cascade is designed. It does not build the artifact — that happens
on a host whose OS matches --target-os (the forge runs it directly when
the host matches, otherwise hands the script to the user). This script's
job is to produce a complete worker folder ready to build.

Usage:
    python scaffold_worker.py \\
        --name my-worker \\
        --description "What the worker does, one paragraph." \\
        --target-os windows \\
        --main path/to/filled-in-main.py \\
        --worker-md path/to/filled-WORKER.md \\
        --authoring-md path/to/filled-AUTHORING.md \\
        --requirements requests==2.32.3 pypdf==4.3.1 \\
        --reads "PDFs in %USERPROFILE%\\Downloads" \\
        --writes "Renamed files in place" \\
        --network "None" \\
        --run-instructions "Double-click the artifact, or drag a folder onto it." \\
        --root C:/Users/David/Desktop/worker-root

Produces:
    <root>/workers/<name>/
        AUTHORING.md
        WORKER.md
        main.py
        worker_runtime.py
        requirements.txt
        resources/             (empty placeholder)
        build/
            build_<os>.{bat|sh}
        dist/                  (empty placeholder)
        README.md

Where <os> is windows / macos / linux, picked by --target-os.

Either of --worker-md / --authoring-md may be omitted. When omitted, the
scaffolder writes a placeholder file from the template the forge can fill
in later — but the canonical flow is for the forge to compose both files
before calling this script.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import stat
import sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"

VALID_TARGET_OS = ("windows", "macos", "linux")


def slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", s.strip().lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "worker"


def class_name(slug: str) -> str:
    parts = re.split(r"[-_]+", slug)
    return "".join(p.capitalize() for p in parts if p) + "Worker"


def render(template_path: Path, subs: dict) -> str:
    text = template_path.read_text(encoding="utf-8")
    for key, value in subs.items():
        text = text.replace("{" + key + "}", value)
    return text


# ---------------------------------------------------------------------------
# Per-OS specifics for the build script and README
# ---------------------------------------------------------------------------

def _build_script_source(target_os: str) -> Path:
    return {
        "windows": ASSETS / "build_windows.bat",
        "macos": ASSETS / "build_macos.sh",
        "linux": ASSETS / "build_linux.sh",
    }[target_os]


def _build_script_filename(target_os: str) -> str:
    return {
        "windows": "build_windows.bat",
        "macos": "build_macos.sh",
        "linux": "build_linux.sh",
    }[target_os]


def _artifact_name(slug: str, target_os: str) -> str:
    return {
        "windows": f"{slug}.exe",
        "macos": slug,            # PyInstaller --onefile produces a Unix executable
        "linux": slug,
    }[target_os]


def _artifact_path(slug: str, target_os: str) -> str:
    name = _artifact_name(slug, target_os)
    if target_os == "windows":
        return f"dist\\{name}"
    return f"dist/{name}"


def _build_instruction(target_os: str) -> str:
    if target_os == "windows":
        return ("Double-click `build\\build_windows.bat`, or run it from a "
                "cmd prompt. A console window opens and the build takes "
                "one to three minutes.")
    if target_os == "macos":
        return ("From a Terminal in this folder, run "
                "`bash build/build_macos.sh`. The build takes one to "
                "three minutes.")
    return ("From a shell in this folder, run "
            "`bash build/build_linux.sh`. The build takes one to "
            "three minutes.")


def _os_warning(target_os: str) -> str:
    if target_os == "windows":
        return ("On Windows, SmartScreen may show a blue warning the first "
                "time you run the .exe. Click **More info -> Run anyway**. "
                "Code-signing is on the roadmap.")
    if target_os == "macos":
        return ("On macOS, Gatekeeper may block the artifact the first time. "
                "Right-click the file in Finder and choose **Open** to "
                "approve it once. Code-signing and notarization are on the "
                "roadmap.")
    return ("On Linux, the artifact is unsigned. Make sure it's executable "
            "(`chmod +x dist/<worker>`) and run it directly.")


def _config_path_hint(target_os: str, slug: str) -> str:
    if target_os == "windows":
        return f"%APPDATA%\\worker-forge\\{slug}\\config.json"
    if target_os == "macos":
        return f"~/Library/Application Support/worker-forge/{slug}/config.json"
    return f"~/.config/worker-forge/{slug}/config.json"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv):
    p = argparse.ArgumentParser()
    p.add_argument("--name", required=True, help="Worker slug, e.g. 'pdf-renamer'.")
    p.add_argument("--description", required=True,
                   help="One-paragraph description of what the worker does.")
    p.add_argument("--target-os", required=True, choices=VALID_TARGET_OS,
                   help="OS the worker is built for (one of: windows, macos, linux).")
    p.add_argument("--main", required=True,
                   help="Path to the filled-in main.py for this worker.")
    p.add_argument("--worker-md",
                   help="Path to the filled-in WORKER.md. If omitted, the "
                        "scaffolder writes the template for later filling.")
    p.add_argument("--authoring-md",
                   help="Path to the filled-in AUTHORING.md. If omitted, the "
                        "scaffolder writes the template for later filling.")
    p.add_argument("--cascade-plan",
                   help="(Optional) cascade-plan markdown for inlining into "
                        "main.py's top-of-file docstring.")
    p.add_argument("--requirements", nargs="*", default=[],
                   help="Pip requirements, one per arg, pinned versions.")
    p.add_argument("--reads", default="(none)")
    p.add_argument("--writes", default="(none)")
    p.add_argument("--network", default="(none)")
    p.add_argument("--run-instructions", default="Double-click the artifact.")
    p.add_argument("--root", required=True,
                   help="Worker root the user picked. The worker lands at "
                        "<root>/workers/<name>/.")
    args = p.parse_args(argv)

    slug = slugify(args.name)
    out_dir = Path(args.root) / "workers" / slug
    if out_dir.exists():
        print(f"refusing to overwrite existing {out_dir}", file=sys.stderr)
        return 2
    out_dir.mkdir(parents=True)

    # Subdirs.
    (out_dir / "resources").mkdir()
    (out_dir / "build").mkdir()
    (out_dir / "dist").mkdir()

    # Runtime — copy unchanged.
    shutil.copy(ASSETS / "worker_runtime.py", out_dir / "worker_runtime.py")

    # Build script — copy the right one into build/.
    build_src = _build_script_source(args.target_os)
    build_dst = out_dir / "build" / _build_script_filename(args.target_os)
    shutil.copy(build_src, build_dst)
    if args.target_os in ("macos", "linux"):
        build_dst.chmod(build_dst.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    # main.py: copy the caller's filled-in version, render placeholder names.
    main_src = Path(args.main).read_text(encoding="utf-8")
    cascade_text = ""
    if args.cascade_plan:
        cascade_text = Path(args.cascade_plan).read_text(encoding="utf-8").strip()
    subs = {
        "WORKER_NAME": slug,
        "WORKER_CLASS": class_name(slug),
        "FORGE_DATE": dt.date.today().isoformat(),
        "TASK_DESCRIPTION": args.description.replace("\n", "\n  "),
        "CASCADE_PLAN": cascade_text.replace("\n", "\n  ") or "(see WORKER.md)",
        "TARGET_OS": args.target_os,
    }
    for k, v in subs.items():
        main_src = main_src.replace("{" + k + "}", v)
    (out_dir / "main.py").write_text(main_src, encoding="utf-8")

    # WORKER.md: prefer the caller's filled-in version; fall back to template.
    if args.worker_md:
        shutil.copy(Path(args.worker_md), out_dir / "WORKER.md")
    else:
        (out_dir / "WORKER.md").write_text(
            (ASSETS / "WORKER_template.md").read_text(encoding="utf-8"),
            encoding="utf-8",
        )

    # AUTHORING.md: same pattern.
    if args.authoring_md:
        shutil.copy(Path(args.authoring_md), out_dir / "AUTHORING.md")
    else:
        (out_dir / "AUTHORING.md").write_text(
            (ASSETS / "AUTHORING_template.md").read_text(encoding="utf-8"),
            encoding="utf-8",
        )

    # requirements.txt: start from the template comment block, add user reqs.
    req_text = (ASSETS / "requirements.txt").read_text(encoding="utf-8")
    if args.requirements:
        req_text += "\n" + "\n".join(args.requirements) + "\n"
    (out_dir / "requirements.txt").write_text(req_text, encoding="utf-8")

    # README.
    readme_subs = {
        "WORKER_NAME": slug,
        "ONE_LINE_DESCRIPTION": args.description.split(".")[0].strip() + ".",
        "FULL_DESCRIPTION": args.description,
        "READS": args.reads,
        "WRITES": args.writes,
        "NETWORK": args.network,
        "RUN_INSTRUCTIONS": args.run_instructions,
        "ARTIFACT_NAME": _artifact_name(slug, args.target_os),
        "ARTIFACT_PATH": _artifact_path(slug, args.target_os),
        "BUILD_INSTRUCTION": _build_instruction(args.target_os),
        "OS_WARNING": _os_warning(args.target_os),
        "CONFIG_PATH": _config_path_hint(args.target_os, slug),
    }
    readme = render(ASSETS / "README_template.md", readme_subs)
    (out_dir / "README.md").write_text(readme, encoding="utf-8")

    # Placeholder files so empty dirs survive any future tooling.
    (out_dir / "resources" / ".gitkeep").write_text("", encoding="utf-8")
    (out_dir / "dist" / ".gitkeep").write_text("", encoding="utf-8")

    print(f"Scaffolded worker at: {out_dir}")
    print(f"Target OS: {args.target_os}")
    print(f"Build with: {build_dst.relative_to(out_dir)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
