#!/usr/bin/env bash
# Shared helpers for the test runner scripts. Sourced, not executed.

# Resolve a Python 3.12+ interpreter, preferring the backend venv.
resolve_py() {
  if [ -x backend/.venv/bin/python ]; then
    echo "$(pwd)/backend/.venv/bin/python"
    return 0
  fi
  for c in python3.12 python3.13 python3; do
    if command -v "$c" >/dev/null 2>&1; then
      # require >= 3.12 (the backend uses `str | None` syntax)
      if "$c" -c 'import sys; sys.exit(0 if sys.version_info[:2] >= (3,12) else 1)' 2>/dev/null; then
        command -v "$c"
        return 0
      fi
    fi
  done
  return 1
}

# Ensure backend/.venv exists with test deps installed (idempotent).
ensure_backend_venv() {
  if [ ! -x backend/.venv/bin/python ]; then
    local py
    py="$(resolve_py)" || { echo "ERROR: need Python 3.12+ on PATH" >&2; return 1; }
    echo "-- creating backend/.venv ($py) --"
    "$py" -m venv backend/.venv
  fi
  if ! backend/.venv/bin/python -c 'import pytest' 2>/dev/null; then
    echo "-- installing backend test deps --"
    backend/.venv/bin/pip install -q --upgrade pip
    backend/.venv/bin/pip install -q -r backend/requirements-test.txt
  fi
}

# Echo a free TCP port on loopback.
free_port() {
  "$(resolve_py)" -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'
}

# Poll a backend /health URL until it responds or times out.
wait_health() {
  local url="$1" deadline=$(( $(date +%s) + 30 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS "$url/health" >/dev/null 2>&1; then return 0; fi
    sleep 0.3
  done
  echo "ERROR: backend did not become healthy: $url" >&2
  return 1
}
