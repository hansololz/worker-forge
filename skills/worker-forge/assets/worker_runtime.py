"""
worker_runtime.py — the cascade runtime every Worker Forge worker imports.

This module is copied unchanged into each forged worker. It provides:

  - A `Worker` base class with a `try_cascade` method that walks the
    code → local-LLM → hosted-LLM tiers and returns the first usable
    result.
  - Helpers for calling a local LLM (Ollama, default model llama3.2:3b)
    and a hosted LLM (Anthropic; OpenAI is a one-liner addition).
  - First-run guided setup: if a worker needs the local tier and Ollama
    isn't installed, or needs the hosted tier and no key is set, the
    runtime prompts the user instead of erroring.
  - API-key storage that prefers the OS keyring when available and
    falls back to a config.json next to the worker's per-user data dir.

The forge does not modify this file. If you want to change runtime
behavior, change it here in the skill's assets/ folder.

Cross-OS notes:
  - Per-worker data lives under %APPDATA%/worker-forge/<name>/ on Windows,
    ~/Library/Application Support/worker-forge/<name>/ on macOS, and
    ~/.config/worker-forge/<name>/ on Linux.
  - The `keyring` package is optional. If it's not installed, the runtime
    falls back to a config.json file in the per-worker data dir.
"""

from __future__ import annotations

import json
import os
import platform
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

OLLAMA_URL = "http://localhost:11434"
DEFAULT_LOCAL_MODEL = "llama3.2:3b"
DEFAULT_HOSTED_PROVIDER = "anthropic"
DEFAULT_HOSTED_MODEL = "claude-sonnet-4-6"


# ---------------------------------------------------------------------------
# Per-worker data dir
# ---------------------------------------------------------------------------

def _data_dir(worker_name: str) -> Path:
    system = platform.system()
    if system == "Windows":
        base = Path(os.environ.get("APPDATA") or Path.home() / "AppData/Roaming")
    elif system == "Darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    d = base / "worker-forge" / worker_name
    d.mkdir(parents=True, exist_ok=True)
    return d


def _config_path(worker_name: str) -> Path:
    return _data_dir(worker_name) / "config.json"


def load_config(worker_name: str) -> dict:
    p = _config_path(worker_name)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_config(worker_name: str, cfg: dict) -> None:
    _config_path(worker_name).write_text(
        json.dumps(cfg, indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# API key storage (keyring with config.json fallback)
# ---------------------------------------------------------------------------

def _keyring_service(worker_name: str) -> str:
    return f"worker-forge:{worker_name}"


def _try_keyring_get(worker_name: str, key: str) -> Optional[str]:
    try:
        import keyring  # type: ignore
        value = keyring.get_password(_keyring_service(worker_name), key)
        return value or None
    except Exception:
        return None


def _try_keyring_set(worker_name: str, key: str, value: str) -> bool:
    try:
        import keyring  # type: ignore
        keyring.set_password(_keyring_service(worker_name), key, value)
        return True
    except Exception:
        return False


def get_secret(worker_name: str, key: str) -> Optional[str]:
    """Return a stored secret. Tries keyring first, then config.json, then env."""
    value = _try_keyring_get(worker_name, key)
    if value:
        return value
    cfg = load_config(worker_name)
    value = cfg.get(key)
    if value:
        return value
    return os.environ.get(key.upper())


def save_secret(worker_name: str, key: str, value: str) -> None:
    """Store a secret in the keyring if available, else config.json."""
    if _try_keyring_set(worker_name, key, value):
        return
    cfg = load_config(worker_name)
    cfg[key] = value
    save_config(worker_name, cfg)


# ---------------------------------------------------------------------------
# Local LLM (Ollama)
# ---------------------------------------------------------------------------

def ollama_available() -> bool:
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=2) as r:
            return r.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def ollama_has_model(model: str) -> bool:
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=5) as r:
            data = json.loads(r.read())
        return any(m.get("name", "").startswith(model) for m in data.get("models", []))
    except Exception:
        return False


def local_llm(prompt: str, model: str = DEFAULT_LOCAL_MODEL,
              system: Optional[str] = None) -> str:
    """Call a local model via Ollama. Raises RuntimeError on failure."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
    }
    if system:
        payload["system"] = system
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read())
        return data.get("response", "").strip()
    except Exception as e:
        raise RuntimeError(f"Local LLM call failed: {e}") from e


# ---------------------------------------------------------------------------
# Hosted LLM (Anthropic by default)
# ---------------------------------------------------------------------------

def hosted_llm(prompt: str, api_key: str,
               model: str = DEFAULT_HOSTED_MODEL,
               provider: str = DEFAULT_HOSTED_PROVIDER,
               system: Optional[str] = None) -> str:
    """Call a hosted model. Single-shot, no streaming."""
    if provider == "anthropic":
        return _anthropic_call(prompt, api_key, model, system)
    if provider == "openai":
        return _openai_call(prompt, api_key, model, system)
    raise ValueError(f"Unknown hosted provider: {provider}")


def _anthropic_call(prompt: str, api_key: str, model: str,
                    system: Optional[str]) -> str:
    body = {
        "model": model,
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        body["system"] = system
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read())
    return "".join(b.get("text", "") for b in data.get("content", [])).strip()


def _openai_call(prompt: str, api_key: str, model: str,
                 system: Optional[str]) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    body = {"model": model, "messages": messages}
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read())
    return data["choices"][0]["message"]["content"].strip()


# ---------------------------------------------------------------------------
# Guided setup
# ---------------------------------------------------------------------------

def ensure_local_ready(worker_name: str, model: str = DEFAULT_LOCAL_MODEL) -> bool:
    """Make sure Ollama is reachable and has the model. Prompt if not."""
    if ollama_available() and ollama_has_model(model):
        return True
    print()
    print("This worker would like to use a local model, but it can't find one.")
    print(f"Looking for Ollama on {OLLAMA_URL} with model '{model}'.")
    print()
    print("To set this up:")
    print("  1. Install Ollama from https://ollama.com/download")
    print(f"  2. From a terminal, run:  ollama pull {model}")
    print("  3. Re-run this worker.")
    print()
    print("(The worker will fall back to its next available tier for now.)")
    return False


def ensure_hosted_ready(worker_name: str,
                        provider: str = DEFAULT_HOSTED_PROVIDER) -> Optional[str]:
    """Return an API key for the hosted provider, prompting if needed."""
    key_field = f"{provider}_api_key"
    key = get_secret(worker_name, key_field)
    if key:
        return key
    print()
    print(f"This worker needs a {provider} API key for at least one of its steps.")
    print(f"You can get one at https://console.{provider}.com/ (or set the "
          f"{provider.upper()}_API_KEY environment variable).")
    try:
        key = input(f"Paste your {provider} API key (or press Enter to skip): ").strip()
    except EOFError:
        key = ""
    if not key:
        return None
    save_secret(worker_name, key_field, key)
    print("Saved.")
    return key


# ---------------------------------------------------------------------------
# Worker base
# ---------------------------------------------------------------------------

@dataclass
class Worker:
    """Base class for a forged worker.

    Subclass this (or just instantiate it), wire up the task in `run`,
    and use `try_cascade` for any unit of work that has multiple tiers.
    """

    name: str
    local_model: str = DEFAULT_LOCAL_MODEL
    hosted_model: str = DEFAULT_HOSTED_MODEL
    hosted_provider: str = DEFAULT_HOSTED_PROVIDER

    _local_ready: Optional[bool] = field(default=None, init=False, repr=False)
    _hosted_key: Optional[str] = field(default=None, init=False, repr=False)
    _hosted_checked: bool = field(default=False, init=False, repr=False)

    # --- cascade entry point ------------------------------------------------

    def try_cascade(
        self,
        name: str,
        code: Optional[Callable[[], Any]] = None,
        local: Optional[Callable[[], Any]] = None,
        hosted: Optional[Callable[[], Any]] = None,
    ) -> Any:
        """Walk the cascade for one unit of work.

        Calls each provided callable in order (code → local → hosted) and
        returns the first non-None result. A callable that raises is
        treated as a fall-through. If every tier yields None or raises,
        returns None.
        """
        for tier_name, callable_, gate in [
            ("code", code, None),
            ("local", local, self._local_gate),
            ("hosted", hosted, self._hosted_gate),
        ]:
            if callable_ is None:
                continue
            if gate is not None and not gate():
                continue
            try:
                result = callable_()
            except Exception as e:
                print(f"[{self.name}] {name}: {tier_name} tier raised "
                      f"{type(e).__name__}: {e} — falling through.")
                continue
            if result is not None:
                return result
        return None

    # --- LLM helpers --------------------------------------------------------

    def call_local(self, prompt: str, system: Optional[str] = None) -> str:
        return local_llm(prompt, model=self.local_model, system=system)

    def call_hosted(self, prompt: str, system: Optional[str] = None) -> str:
        key = self._ensure_hosted_key()
        if not key:
            raise RuntimeError("No hosted API key available.")
        return hosted_llm(
            prompt, api_key=key, model=self.hosted_model,
            provider=self.hosted_provider, system=system,
        )

    # --- gates --------------------------------------------------------------

    def _local_gate(self) -> bool:
        if self._local_ready is None:
            self._local_ready = ensure_local_ready(self.name, self.local_model)
        return self._local_ready

    def _hosted_gate(self) -> bool:
        return self._ensure_hosted_key() is not None

    def _ensure_hosted_key(self) -> Optional[str]:
        if not self._hosted_checked:
            self._hosted_key = ensure_hosted_ready(self.name, self.hosted_provider)
            self._hosted_checked = True
        return self._hosted_key

    # --- to be overridden by the forged worker ------------------------------

    def run(self) -> None:
        raise NotImplementedError(
            "Subclass Worker and override run(), or assign a function to "
            "worker.run before calling it."
        )


# ---------------------------------------------------------------------------
# Convenience for very small workers
# ---------------------------------------------------------------------------

def run_worker(worker: Worker) -> int:
    """Run a worker and return a process exit code."""
    try:
        worker.run()
        return 0
    except KeyboardInterrupt:
        print("\nInterrupted.")
        return 130
    except Exception as e:
        print(f"[{worker.name}] fatal: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
