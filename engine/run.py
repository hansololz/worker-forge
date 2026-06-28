"""Entry point for the worker-forge backend.

Used both in development (``python run.py``) and as the PyInstaller target that
gets frozen into a single binary for the packaged macOS app.
"""

from __future__ import annotations

import argparse

import uvicorn

from app.main import app


def main() -> None:
    parser = argparse.ArgumentParser(prog="worker-forge-backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
