"""
worker_runtime — the cascade runtime every worker imports unchanged.

This is the boilerplate. It gives the worker:

- A `Worker` class to register cascade units (CODE, LOCAL, HOSTED).
- Helpers to call a local model — via Ollama (the default) or Hugging Face
  `transformers` — or a hosted model with an API key pulled from the OS keyring.
- A `run_worker` entry point that walks the cascade in order and writes a
  small status line to stdout per unit.

The runtime is intentionally small. Each unit is a callable; the cascade is a
list of (name, tier, callable) tuples in the order the worker should run them.
A unit can declare a fallback by registering itself with a `fallback=` callable
at the next tier — but only when the forge decided at design time that the unit
needs one (see `cascade.md`). Fallback is opt-in and explicit. The runtime
never escalates a unit on its own; if a unit fails and has no fallback
registered, the run fails. This matches the rule in `design.md`: tier
escalation is a forge-time decision, not a silent run-time fallback.

If you find yourself adding feature flags or branching logic here, stop. That
belongs in the worker's `main.py`, not in the runtime.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

Tier = Literal["CODE", "LOCAL", "HOSTED"]


@dataclass
class Unit:
    name: str
    tier: Tier
    func: Callable[..., Any]
    fallback: "Unit | None" = None


@dataclass
class Worker:
    name: str
    units: list[Unit] = field(default_factory=list)
    context: dict[str, Any] = field(default_factory=dict)

    # --- registration helpers -------------------------------------------------

    def code(self, name: str, func: Callable[..., Any], *, fallback: Unit | None = None) -> None:
        self.units.append(Unit(name=name, tier="CODE", func=func, fallback=fallback))

    def local(self, name: str, func: Callable[..., Any], *, fallback: Unit | None = None) -> None:
        self.units.append(Unit(name=name, tier="LOCAL", func=func, fallback=fallback))

    def hosted(self, name: str, func: Callable[..., Any]) -> None:
        # HOSTED is the top of the cascade; no fallback above it.
        self.units.append(Unit(name=name, tier="HOSTED", func=func))

    # --- inference helpers ----------------------------------------------------

    def call_local(
        self, model: str, prompt: str, *, runtime: str = "ollama", timeout: float = 60.0
    ) -> str:
        """Call a local model and return the response string.

        `runtime` selects how the model is run — it's the tool the user picked
        in the interview (recorded in `<os>-specific.md`), chosen *after* the
        model because not every model lives in every runtime:

        - "ollama" (default) — talk to a local Ollama server over HTTP. The
          right pick when the model is in the Ollama library; cheapest to
          bundle (no Python ML stack).
        - "huggingface" / "transformers" — load the model with the Hugging Face
          `transformers` library from the local cache. The pick when the model
          is a Hugging Face–only checkpoint that Ollama can't serve.

        Raises RuntimeError if the runtime isn't reachable/installed so the
        caller can fall back to a higher tier explicitly.
        """
        if runtime in ("huggingface", "transformers", "hf"):
            return self._call_huggingface(model, prompt, timeout=timeout)
        if runtime != "ollama":
            raise ValueError(f"Unknown local runtime: {runtime}")
        payload = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode("utf-8")
        req = urllib.request.Request(
            "http://localhost:11434/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            raise RuntimeError(
                "Could not reach Ollama at http://localhost:11434. "
                "Install Ollama (https://ollama.com) and run `ollama pull "
                f"{model}` once before running this worker."
            ) from exc
        return body.get("response", "")

    def _call_huggingface(self, model: str, prompt: str, *, timeout: float = 60.0) -> str:
        """Run `model` locally through Hugging Face `transformers`.

        Lazy-imports `transformers` so a worker that only uses Ollama never
        pays for the dependency. The pipeline is cached on the worker so the
        model is loaded once per process, not once per call. `model` is a Hub
        repo id (e.g. "meta-llama/Llama-3.2-3B-Instruct"); weights come from
        the local cache, populated by the first-run setup script or an earlier
        run. `timeout` is accepted for signature parity with the Ollama path;
        local generation isn't interruptible the same way, so it's advisory.
        """
        try:
            from transformers import pipeline  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError(
                "This worker runs its local model through Hugging Face transformers, "
                "which isn't installed. Run `pip install transformers` (plus a backend "
                "like torch), or run the bundled setup_local_models script, then retry."
            ) from exc

        cache = self.context.setdefault("_hf_pipelines", {})
        gen = cache.get(model)
        if gen is None:
            gen = pipeline("text-generation", model=model)
            cache[model] = gen
        out = gen(prompt, return_full_text=False)
        # transformers returns a list of dicts; pull the generated text out.
        if isinstance(out, list) and out and isinstance(out[0], dict):
            return out[0].get("generated_text", "")
        return str(out)

    def call_hosted(
        self, provider: str, model: str, prompt: str, *, max_tokens: int = 4096
    ) -> str:
        """Call a hosted model. The API key is read from the OS keyring on
        first need. Currently a thin shim — the worker is expected to override
        with the provider SDK at code-gen time if it needs richer features.

        `model` is a provider-specific identifier (e.g. an Anthropic Opus /
        Sonnet / Haiku string) chosen at forge time. Match the model to what
        the unit actually needs — a top-tier model for frontier judgment, a
        balanced one for everyday hosted work — and note that these identifiers
        change as providers ship and deprecate versions, so the forge confirms
        the current string rather than hard-coding one that may have retired.

        `max_tokens` caps the response length. The default (4096) is generous
        enough for summaries and drafts; raise it for a unit that produces a
        long document (e.g. a multi-page contract brief) so the output isn't
        silently truncated.
        """
        key = _get_api_key(provider)
        if provider == "anthropic":
            return _anthropic_completion(key, model, prompt, max_tokens)
        if provider in ("openai", "open_ai"):
            return _openai_completion(key, model, prompt, max_tokens)
        if provider == "gemini":
            return _gemini_completion(key, model, prompt, max_tokens)
        raise ValueError(f"Unknown hosted provider: {provider}")

    # --- cascade execution ----------------------------------------------------

    def run(self) -> int:
        """Walk the cascade in order. Return 0 on success, non-zero on failure."""
        for unit in self.units:
            ok = _run_with_fallback(unit, self)
            if not ok:
                _log_status(unit.name, unit.tier, "FAIL")
                return 1
            _log_status(unit.name, unit.tier, "OK")
        return 0


def _run_with_fallback(unit: Unit, worker: Worker) -> bool:
    """Try the unit. On a recognized "can't satisfy" signal, fall back."""
    try:
        unit.func(worker)
        return True
    except CascadeEscalate as exc:
        if unit.fallback is None:
            sys.stderr.write(
                f"unit {unit.name}: escalated but no fallback registered ({exc}).\n"
            )
            return False
        sys.stderr.write(
            f"unit {unit.name}: {unit.tier} couldn't satisfy ({exc}); falling back to {unit.fallback.tier}.\n"
        )
        return _run_with_fallback(unit.fallback, worker)
    except Exception as exc:  # noqa: BLE001 — runtime is the boundary
        sys.stderr.write(f"unit {unit.name}: error: {exc}\n")
        return False


class CascadeEscalate(Exception):
    """Raise from inside a unit when the current tier can't satisfy the work.

    The runtime will fall back to the next-higher tier registered on the same
    unit. Use this instead of letting unrelated exceptions escape — those
    signal a bug, not a tier mismatch.
    """


def _log_status(name: str, tier: Tier, status: str) -> None:
    ts = time.strftime("%H:%M:%S")
    sys.stdout.write(f"[{ts}] {name} ({tier}) {status}\n")
    sys.stdout.flush()


def run_worker(worker: Worker) -> int:
    """Convenience wrapper: print a header, run the worker, return its exit code."""
    sys.stdout.write(f"Worker: {worker.name}\n")
    sys.stdout.write(f"Units: {len(worker.units)}\n")
    sys.stdout.write("-" * 40 + "\n")
    return worker.run()


# --- API key handling ---------------------------------------------------------

KEYRING_SERVICE = "worker-forge"


def _get_api_key(provider: str) -> str:
    """Resolve the API key for a provider in order: env var → OS keyring → prompt."""
    env_var = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "open_ai": "OPENAI_API_KEY",
        "gemini": "GEMINI_API_KEY",
    }.get(provider)
    if env_var and os.environ.get(env_var):
        return os.environ[env_var]

    # Lazy import — keyring is only needed when a HOSTED unit fires.
    try:
        import keyring  # type: ignore[import-not-found]
    except ImportError:
        keyring = None

    if keyring is not None:
        stored = keyring.get_password(KEYRING_SERVICE, provider)
        if stored:
            return stored

    key = _prompt_for_key(provider)
    if keyring is not None:
        try:
            keyring.set_password(KEYRING_SERVICE, provider, key)
        except Exception:  # noqa: BLE001 — keyring backends vary on Linux
            sys.stderr.write(
                "warning: couldn't store key in OS keyring; you'll be asked again next run.\n"
            )
    return key


def _prompt_for_key(provider: str) -> str:
    sys.stderr.write(
        f"This worker needs an API key for {provider}. "
        f"Paste it now (it will be stored in your OS keyring): "
    )
    sys.stderr.flush()
    return input().strip()


# --- minimal hosted-provider shims --------------------------------------------
# These are deliberately small. A worker that needs streaming, tool use, or
# anything beyond a single completion should swap in the official SDK at
# code-gen time.

def _anthropic_completion(key: str, model: str, prompt: str, max_tokens: int = 4096) -> str:
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(
            {
                "model": model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            }
        ).encode("utf-8"),
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body["content"][0]["text"]


def _openai_completion(key: str, model: str, prompt: str, max_tokens: int = 4096) -> str:
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(
            {
                "model": model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            }
        ).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body["choices"][0]["message"]["content"]


def _gemini_completion(key: str, model: str, prompt: str, max_tokens: int = 4096) -> str:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        f"?key={key}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(
            {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"maxOutputTokens": max_tokens},
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body["candidates"][0]["content"]["parts"][0]["text"]
