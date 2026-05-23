#!/usr/bin/env python3
"""
Create a new Workshop directory tree for a worker.

The Workshop is the source of truth for a worker - spec, source, build scripts,
resources, and built artifact all live in one folder. This script lays out the
canonical structure from design.md and stages the template files from the
skill's `assets/` folder.

Usage:
    python setup_workshop.py --name my-worker --root /path/to/root
    python setup_workshop.py --name my-worker --root /path/to/root --target-os windows
"""

import argparse
import os
import re
import shutil
import sys
from pathlib import Path


VALID_OS = {"windows", "macos", "linux"}


def slugify(name):
    name = name.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "-", name)
    name = name.strip("-")
    if not name:
        raise ValueError("Worker name is empty after slugifying.")
    return name


def assets_dir():
    return Path(__file__).resolve().parent.parent / "assets"


def copy_template(src, dst, substitutions=None):
    if not src.exists():
        raise FileNotFoundError(f"Template not found: {src}")
    text = src.read_text(encoding="utf-8")
    if substitutions:
        for key, value in substitutions.items():
            text = text.replace("{{" + key + "}}", value)
    dst.write_text(text, encoding="utf-8")


SKELETON_MAIN = '''"""
WORKER_NAME

Cascade plan (filled in during code-gen):

    1. <unit_name> (CODE|LOCAL|HOSTED) - <one-line description>
    2. ...

See WORKER.md (one directory up) for the full spec.
"""

import sys

from worker_runtime import Worker, run_worker


def example_code_unit(worker):
    """Deterministic step. Replace with the worker's actual logic."""
    worker.context["hello"] = "world"


def example_local_unit(worker):
    """LOCAL unit. Calls Ollama via the runtime helper.

    Raise CascadeEscalate if the LOCAL tier can't satisfy the work and a
    HOSTED fallback should fire.
    """
    response = worker.call_local(
        model="llama3.2:3b",
        prompt="Reply with the word 'ok'.",
    )
    worker.context["local_reply"] = response


def main():
    worker = Worker(name="WORKER_NAME")
    # Register cascade units in the order the worker should run them.
    # worker.code("prepare", example_code_unit)
    # worker.local("classify", example_local_unit)
    # worker.hosted("summarize", summarize_with_anthropic)
    return run_worker(worker)


if __name__ == "__main__":
    sys.exit(main())
'''


def write_skeleton_main(dst, worker_slug):
    text = SKELETON_MAIN.replace("WORKER_NAME", worker_slug)
    dst.write_text(text, encoding="utf-8")


def setup_workshop(name, root, target_os):
    slug = slugify(name)
    workshop = root / "workshops" / slug

    if workshop.exists():
        raise FileExistsError(
            f"Workshop already exists at {workshop}. "
            f"Move or rename it before re-running, or use reforge instead."
        )

    workshop.mkdir(parents=True)
    (workshop / "resources").mkdir()
    (workshop / "build").mkdir()
    (workshop / "dist").mkdir()

    assets = assets_dir()
    subs = {"WORKER_NAME": slug}

    copy_template(assets / "WORKER.md.template", workshop / "WORKER.md", subs)
    copy_template(assets / "AUTHORING.md.template", workshop / "AUTHORING.md", subs)

    shutil.copy2(assets / "worker_runtime.py", workshop / "build" / "worker_runtime.py")
    copy_template(assets / "requirements.txt", workshop / "build" / "requirements.txt", subs)
    write_skeleton_main(workshop / "build" / "main.py", slug)

    if target_os:
        target_os = target_os.lower()
        if target_os not in VALID_OS:
            raise ValueError(
                f"Unknown target OS: {target_os!r}. Pick one of: {sorted(VALID_OS)}"
            )
        if target_os == "windows":
            copy_template(
                assets / "build_windows.bat",
                workshop / "build" / "build_windows.bat",
                subs,
            )
        elif target_os == "macos":
            src = assets / "build_macos.sh"
            dst = workshop / "build" / "build_macos.sh"
            copy_template(src, dst, subs)
            os.chmod(dst, 0o755)
        elif target_os == "linux":
            src = assets / "build_linux.sh"
            dst = workshop / "build" / "build_linux.sh"
            copy_template(src, dst, subs)
            os.chmod(dst, 0o755)

    return workshop


def main(argv=None):
    parser = argparse.ArgumentParser(description="Create a Workshop directory for a worker.")
    parser.add_argument("--name", required=True,
                        help="Worker name. Slugified for the folder.")
    parser.add_argument("--root", required=True, type=Path,
                        help="Root directory under which workshops/<worker-name>/ will be created.")
    parser.add_argument("--target-os", choices=sorted(VALID_OS),
                        help="If set, copy the matching build script into build/.")
    args = parser.parse_args(argv)

    try:
        workshop = setup_workshop(args.name, args.root, args.target_os)
    except (FileExistsError, FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"Workshop created at: {workshop}")
    print()
    print("Next steps:")
    print(f"  1. Fill in {workshop / 'WORKER.md'} with the spec and cascade plan.")
    print(f"  2. Fill in {workshop / 'AUTHORING.md'} with the interview transcript.")
    print(f"  3. Edit {workshop / 'build' / 'main.py'} to implement the cascade units.")
    print(f"  4. Run the build script in {workshop / 'build'} to produce the artifact.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
