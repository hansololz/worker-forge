"""
{WORKER_NAME} — forged by Worker Forge on {FORGE_DATE}

Task description (from the user):
  {TASK_DESCRIPTION}

Cascade plan (canonical copy lives in WORKER.md; this is for quick reference):
  {CASCADE_PLAN}

This file is the worker's task logic. The runtime (worker_runtime.py)
handles config, the cascade walk, local-model setup, and hosted-LLM keys
— don't touch it. Add libraries to requirements.txt as needed.

To rebuild after editing: run the build script in build/. The output is
in dist/.

Target OS: {TARGET_OS}
"""

from __future__ import annotations

import sys

from worker_runtime import Worker, run_worker


# ---------------------------------------------------------------------------
# Cascade units — implement each unit of work as a small function.
# Use WORKER.md's cascade plan as the source of truth for which tier does
# which job. Pure-code units don't need to go through try_cascade.
# ---------------------------------------------------------------------------

# Example pattern (delete these stubs when you fill in real logic):

def _example_code_unit(text: str) -> str | None:
    """A deterministic extraction. Returns None if it can't find the answer
    so try_cascade falls through to the next tier."""
    # ... regex, parsing, etc.
    return None


def _example_local_unit(worker: Worker, text: str) -> str | None:
    """Local-LLM fallback for the example above."""
    prompt = f"Extract the requested value from:\n\n{text}\n\nAnswer with the value only."
    answer = worker.call_local(prompt)
    return answer or None


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------

class {WORKER_CLASS}(Worker):

    def run(self) -> None:
        # 1) Gather input.
        #    Common patterns: sys.argv[1] for a file/folder dropped on the
        #    artifact, a hardcoded path, or reading from a known location.
        if len(sys.argv) > 1:
            target = sys.argv[1]
        else:
            target = "."  # change as appropriate

        # 2) Do the work. Use try_cascade for any unit that has multiple
        #    tiers; just call functions directly for pure-code units.
        #
        # result = self.try_cascade(
        #     name="extract_value",
        #     code=lambda: _example_code_unit(text),
        #     local=lambda: _example_local_unit(self, text),
        #     hosted=None,
        # )

        # 3) Emit output. Don't be silent. At minimum, print what happened.
        print(f"[{self.name}] processed {target}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    worker = {WORKER_CLASS}(name="{WORKER_NAME}")
    return run_worker(worker)


if __name__ == "__main__":
    sys.exit(main())
