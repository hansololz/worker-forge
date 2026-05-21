# Designing the execution cascade

The cascade is the runtime contract. Every worker is structured as a sequence of *units of work*, and each unit is annotated with the cheapest mechanism that can satisfy it. At run time the worker walks the cascade and only escalates to a more expensive tier when the cheaper one cannot deliver an acceptable answer.

This document is the reference for designing the cascade at forge time. Read it before writing the worker's code.

## The three tiers

**CODE** — A deterministic function. Regex, file walk, HTTP call, parser, library function. Zero marginal cost. The default tier; anything that *can* be done with code *should* be.

**LOCAL** — A small instruction-tuned model running on the user's machine via Ollama (default model: `llama3.2:3b`, but the runtime lets the user pick). Effectively zero marginal cost once installed, but the user has to install Ollama first if they haven't. Good for: fuzzy classification, small-input summarization, simple extraction from messy text, yes/no judgment calls.

**HOSTED** — A frontier model from Anthropic or OpenAI, called via the user's API key. Real per-call cost, real network dependency. Reserved for tasks that genuinely need frontier-level judgment — nuanced reasoning, long-context synthesis, multi-step extraction from complex documents.

## The decision rule

For each unit of work, ask in this order:

1. Could a focused engineer write a 20-line function that does this reliably? → **CODE.**
2. If not, would a 3B-parameter model running locally produce an acceptable answer most of the time? → **LOCAL.**
3. Only if both no → **HOSTED.**

Most workers are mostly CODE. A worker that watches a folder and renames files based on filename patterns is 100% CODE. A worker that summarizes PDFs is CODE (extract text) + LOCAL (summarize). A worker that reads a contract and extracts every counterparty obligation is CODE (extract text) + HOSTED (the legal reasoning is past local-model reach).

When in doubt, start lower and let it fail upward — see "Escalation" below.

## Worked examples

### File-rename worker

Task: watch Downloads, rename `*.pdf` files based on the document date inside.

| Unit | Tier | Rationale |
|---|---|---|
| List new PDFs in Downloads | CODE | `os.listdir` + a seen-set in config. |
| Extract text from the first page | CODE | `pypdf` library. |
| Find the document date in the text | CODE → LOCAL fallback | Try regex first (`\d{4}-\d{2}-\d{2}` and a few common formats), fall back to local model if no match. |
| Rename the file | CODE | `os.rename`. |
| Log result | CODE | Append to log file. |

The date extraction tries CODE first, escalates to LOCAL only if regex fails. That's the spirit of the cascade — code first, model as fallback.

### Daily news digest

Task: pull articles from a configured set of feeds, cluster duplicates, summarize each cluster, write a Markdown briefing.

| Unit | Tier | Rationale |
|---|---|---|
| Fetch feeds | CODE | `feedparser`. |
| Deduplicate by URL | CODE | Set membership. |
| Cluster near-duplicates | LOCAL | Embeddings + simple clustering would also be CODE-tier; pick whichever is simpler. |
| Summarize each cluster | LOCAL | Local model handles short summaries fine. |
| Write Markdown file | CODE | String formatting. |

### Contract obligation extractor

Task: drop a contract PDF on the worker, get a list of every obligation by party.

| Unit | Tier | Rationale |
|---|---|---|
| Extract PDF text | CODE | `pypdf`. |
| Identify parties | HOSTED | Names, aliases, abbreviations — hosted handles this without missing edge cases. |
| Extract obligations per party | HOSTED | Legal text + nuanced reasoning is past local-model range. |
| Write report | CODE | String formatting. |

This worker has a real per-invocation cost. That's fine — but it means the user must have an API key, and the runtime's first-run setup will surface that requirement.

## Escalation

A cascade is only useful if the worker can detect that a cheaper tier failed and escalate. The runtime supports this via the `worker.try_cascade` helper — see `worker_runtime.py`. Pattern:

```python
date = worker.try_cascade(
    name="extract_document_date",
    code=lambda: extract_date_via_regex(text),
    local=lambda: extract_date_via_local_llm(text),
    hosted=None,  # not allowed to escalate to hosted for this unit
)
```

`try_cascade` calls each callable in order, returns the first non-None result, and falls through on `None` or exception. If the unit is annotated `CODE → LOCAL fallback`, list the cheaper tier first.

## The cascade plan goes in WORKER.md

Write the cascade table into `WORKER.md` under a `## Cascade plan` heading. The user sees it. The next reforge reads it. The same table also belongs as a docstring at the top of `main.py`, but `WORKER.md` is the canonical copy — when they disagree, `WORKER.md` wins.

This is the "transparency and reforge" requirement made concrete: the worker carries its own design in plain language, separate from the code.

## Forge-time evaluation

If a unit's tier choice is uncertain — usually a CODE → LOCAL or LOCAL → HOSTED boundary — try a representative input before locking it in. The user's first example is good enough. If LOCAL gives a wrong answer on the example, the unit needs HOSTED in the cascade plan. Don't let a run-time discovery be the first signal that the tier was wrong.

Record the test and its outcome in `AUTHORING.md` so a later reforge has the evidence.

## What not to cascade

Don't over-cascade. If a unit is purely deterministic (write a file, parse JSON, call a known API), just call it. The cascade is for units that have a *judgment* dimension — extraction, classification, summarization, decisions under ambiguity. Wrapping a `file.write` in `try_cascade` is noise.
