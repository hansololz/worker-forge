# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec: freeze the backend into a single ``worker-forge-backend`` binary."""

from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = []

# Pull in everything these packages need (data files, dynamic submodules).
for pkg in (
    "uvicorn",
    "fastapi",
    "starlette",
    "pydantic",
    "pydantic_core",
    "sqlalchemy",
    "anyio",
    "click",
    "h11",
    "websockets",
    "yaml",
    "croniter",
):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

a = Analysis(
    ["run.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="worker-forge-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
