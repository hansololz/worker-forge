#!/usr/bin/env python3
"""
Create (or extend) a Workspace directory tree for a worker.

The Workspace is the source of truth for a worker — spec, source, build script,
resources, and built artifact all live in one folder. `AUTHORING.md` and
`WORKER.md` at the workspace root capture what's true of the worker regardless
of OS; each `<os>/` subfolder underneath holds the source, build script,
resources, and dist directory for one OS specifically.

The skill only ever builds for the OS it's currently running on, so this script
auto-detects the host OS and creates exactly one `<os>/` folder per invocation.
If the user later wants to ship the same worker on a different OS, re-run the
forge on that machine and pass `--add-os` — a sibling `<os>/` folder gets
dropped in alongside the existing one without touching it.

Usage:
    # Initial forge on the current host
    python setup_workspace.py --name my-worker --root /path/to/root
    python setup_workspace.py --name my-worker --display-name "My Worker" --root /path/to/root

    # Reforge on a new OS — workspace already exists, AUTHORING.md / WORKER.md stay put
    python setup_workspace.py --name my-worker --root /path/to/root --add-os

    # Override the auto-detected OS (rare — useful for testing or when the user
    # is on, say, WSL and explicitly wants the Linux build)
    python setup_workspace.py --name my-worker --root /path/to/root --os linux
"""

import argparse
import os
import platform
import re
import shutil
import sys
from pathlib import Path


VALID_OS = {"windows", "mac", "linux"}

# Per-OS metadata. Keys are the canonical OS slugs used for the folder names
# inside the Workspace. The build-script names map to files under assets/.
OS_INFO = {
    "windows": {
        "build_script": "build_windows.bat",
        "specific_md": "windows-specific.md",
        "specific_template": "windows-specific.md.template",
        "executable_bit": False,
    },
    "mac": {
        "build_script": "build_macos.sh",
        "specific_md": "mac-specific.md",
        "specific_template": "mac-specific.md.template",
        "executable_bit": True,
    },
    "linux": {
        "build_script": "build_linux.sh",
        "specific_md": "linux-specific.md",
        "specific_template": "linux-specific.md.template",
        "executable_bit": True,
    },
}


def detect_host_os():
    """Map platform.system() onto our canonical {windows, mac, linux} slugs."""
    system = platform.system().lower()
    if system == "windows":
        return "windows"
    if system == "darwin":
        return "mac"
    if system == "linux":
        return "linux"
    raise RuntimeError(
        f"Unsupported host OS: {platform.system()!r}. "
        f"Worker Forge supports Windows, macOS, and Linux. "
        f"Pass --os explicitly if you know what you're doing."
    )


def slugify(name):
    name = name.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "-", name)
    name = name.strip("-")
    if not name:
        raise ValueError("Worker name is empty after slugifying.")
    return name


def default_display_name(slug):
    """Title-case the slug as a fallback display name (`receipt-filer` → `Receipt Filer`)."""
    return " ".join(part.capitalize() for part in slug.split("-") if part)


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
WORKER_DISPLAY_NAME (slug: WORKER_SLUG) — TARGET_OS build

Cascade plan (filled in during code-gen):

    1. <unit_name> (CODE|LOCAL|HOSTED) - <one-line description>
    2. ...

See ../WORKER.md for the OS-agnostic spec and ./TARGET_OS-specific.md for
the answers tied to this OS.
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
    worker = Worker(name="WORKER_DISPLAY_NAME")
    # Register cascade units in the order the worker should run them.
    # worker.code("prepare", example_code_unit)
    # worker.local("classify", example_local_unit)
    # worker.hosted("summarize", summarize_with_anthropic)
    return run_worker(worker)


if __name__ == "__main__":
    sys.exit(main())
'''


def write_skeleton_main(dst, worker_slug, display_name, target_os):
    text = SKELETON_MAIN.replace("WORKER_DISPLAY_NAME", display_name)
    text = text.replace("WORKER_SLUG", worker_slug)
    text = text.replace("TARGET_OS", target_os)
    dst.write_text(text, encoding="utf-8")


def write_root_files(workspace, slug, display, assets):
    """Create AUTHORING.md and WORKER.md at the workspace root if they aren't there yet."""
    subs = {"WORKER_NAME": slug, "WORKER_DISPLAY_NAME": display}
    for filename, template in (
        ("WORKER.md", "WORKER.md.template"),
        ("AUTHORING.md", "AUTHORING.md.template"),
    ):
        target = workspace / filename
        if target.exists():
            continue
        copy_template(assets / template, target, subs)


def write_os_folder(workspace, slug, display, target_os, assets):
    """Create the `<os>/` folder and populate it with build files for that OS."""
    info = OS_INFO[target_os]
    os_dir = workspace / target_os
    if os_dir.exists():
        raise FileExistsError(
            f"OS folder already exists: {os_dir}. "
            f"This worker is already set up for {target_os} — use the reforge flow "
            f"in references/reforge.md instead."
        )

    os_dir.mkdir(parents=True)
    (os_dir / "resources").mkdir()
    (os_dir / "dist").mkdir()

    subs = {
        "WORKER_NAME": slug,
        "WORKER_DISPLAY_NAME": display,
        "TARGET_OS": target_os,
    }

    # OS-specific interview-answers file.
    copy_template(
        assets / info["specific_template"],
        os_dir / info["specific_md"],
        subs,
    )

    # Source + runtime + dependencies.
    shutil.copy2(assets / "worker_runtime.py", os_dir / "worker_runtime.py")
    copy_template(assets / "requirements.txt", os_dir / "requirements.txt", subs)
    write_skeleton_main(os_dir / "main.py", slug, display, target_os)

    # Build script for this OS.
    build_src = assets / info["build_script"]
    build_dst = os_dir / info["build_script"]
    copy_template(build_src, build_dst, subs)
    if info["executable_bit"]:
        os.chmod(build_dst, 0o755)

    return os_dir


def setup_workspace(name, root, target_os, display_name=None, add_os=False):
    slug = slugify(name)
    display = display_name.strip() if display_name else default_display_name(slug)
    if not display:
        display = default_display_name(slug)
    workspace = root / "workspaces" / slug
    assets = assets_dir()

    if add_os:
        # Reforge flow: the workspace must already exist, and the OS folder must not.
        if not workspace.exists():
            raise FileNotFoundError(
                f"--add-os was passed but no workspace exists at {workspace}. "
                f"Run an initial forge first (without --add-os)."
            )
    else:
        # Initial forge: the workspace must not exist yet.
        if workspace.exists():
            raise FileExistsError(
                f"Workspace already exists at {workspace}. "
                f"If you're adding support for a new OS, pass --add-os. "
                f"If you want to start over, archive the old workspace first."
            )
        workspace.mkdir(parents=True)

    # AUTHORING.md and WORKER.md live at the workspace root and are OS-agnostic.
    # On --add-os they should already exist; write_root_files leaves them alone.
    write_root_files(workspace, slug, display, assets)

    # Create the new <os>/ folder.
    os_dir = write_os_folder(workspace, slug, display, target_os, assets)

    return workspace, os_dir


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Create a Workspace for a worker (initial forge) or add an OS "
                    "folder to an existing Workspace (reforge for a new OS).",
    )
    parser.add_argument("--name", required=True,
                        help="Worker name. Slugified for the folder.")
    parser.add_argument("--display-name",
                        help="Human-readable name for window titles, headings, and the "
                             "built artifact filename (e.g. 'Manga Katana Watcher.exe', "
                             "not 'manga-katana-watcher.exe'). Defaults to a title-cased "
                             "version of --name.")
    parser.add_argument("--root", required=True, type=Path,
                        help="Root directory under which workspaces/<worker-name>/ lives.")
    parser.add_argument("--os", choices=sorted(VALID_OS), dest="os_override",
                        help="Override the auto-detected host OS. Rare — useful for "
                             "testing or for hosts like WSL where the default isn't right.")
    parser.add_argument("--add-os", action="store_true",
                        help="Reforge mode: add an <os>/ folder to an existing Workspace "
                             "without touching AUTHORING.md / WORKER.md or any other OS folder.")
    args = parser.parse_args(argv)

    try:
        target_os = args.os_override or detect_host_os()
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    try:
        workspace, os_dir = setup_workspace(
            args.name, args.root, target_os,
            display_name=args.display_name,
            add_os=args.add_os,
        )
    except (FileExistsError, FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"Workspace: {workspace}")
    print(f"OS folder: {os_dir} (target: {target_os})")
    print()
    print("Next steps:")
    if not args.add_os:
        print(f"  1. Fill in {workspace / 'WORKER.md'} with the spec and cascade plan.")
        print(f"  2. Fill in {workspace / 'AUTHORING.md'} with OS-agnostic interview notes.")
        next_n = 3
    else:
        print(f"  (AUTHORING.md and WORKER.md already exist — leave them alone.)")
        next_n = 1
    print(f"  {next_n}. Fill in {os_dir / OS_INFO[target_os]['specific_md']} "
          f"with OS-specific interview answers.")
    print(f"  {next_n + 1}. Edit {os_dir / 'main.py'} to implement the cascade units.")
    print(f"  {next_n + 2}. Run {os_dir / OS_INFO[target_os]['build_script']} "
          f"to produce the artifact in {os_dir / 'dist'}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
