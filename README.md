# Worker Forge

Agent skill that turn a plain-language task into a portable program that runs on your own machine. You describe
what you want; and it will produce a single program — a *worker* — that runs on your machine. Double-click it, schedule
it, or hand it to someone else.

## The problem

A lot of useful desktop work is small, manual, and repetitive: renaming a folder of PDFs, checking a page for changes,
building a weekly digest from a few feeds. Each task is often too narrow for off-the-shelf software and too small to pay
a developer for, so it stays manual.

The obvious solution — wire it to a hosted LLM — has three problems:

1. **Cost.** Hosted-LLM pricing today is subsidized by VC funding and subject to change.
2. **Availability.** Providers shut down, deprecate models, and change pricing on their own schedule.
3. **Connectivity.** Hosted calls require an internet connection at run time, and many useful tasks should run on a
   laptop in airplane mode.

## How Worker Forge solves the problem

Worker Forge bets on three things: local hardware keeps getting more capable at running models, local models keep
getting better, and many subtasks don't need a model at all.

Each worker is built around a three-tier cascade:

1. **CODE** — deterministic Python (regex, parser, HTTP, library call).
2. **LOCAL** — a small LLM running on your machine via Ollama.
3. **HOSTED** — a frontier model with your own API key.

When forging a worker, Worker Forge tries to express each subtask in code first. If code can't handle the subtask, the
worker calls a local model. If a local model isn't capable enough, the worker falls back to a hosted model. Most
workers never reach the third tier.

Worker Forge interviews you about edge cases, output location, error behavior, and target OS. It writes the worker into
your *Workshop* (a persistent folder on your machine), builds the artifact for Windows / macOS / Linux, and hands you
the result.

One worker does one job. The worker runs and exits — no daemons, no servers. It triggers from a double-click, a
schedule, a cron entry, or an event.

## Examples

### Rename PDFs by their document date

The worker watches your Downloads folder, opens each new PDF, finds the document date on the first page, and renames the
file to `YYYY-MM-DD_<original-name>.pdf`. It tries regex first and falls back to a local model when the date format is
unusual. Every rename is logged.

Cascade: CODE everywhere except date extraction (CODE → LOCAL fallback). No network calls.

### Daily news digest

The worker pulls articles from a configured set of RSS feeds, deduplicates by URL, clusters near-duplicates, summarizes
each cluster, and writes a Markdown briefing to `~/Documents/digest.md`. It runs on a schedule you wire into Task
Scheduler / launchd / cron.

Cascade: CODE for fetch, dedupe, and output. LOCAL for clustering and summaries. No hosted calls.

### Contract obligation extractor

You drop a contract PDF on the worker. It extracts the text, identifies the parties, lists every obligation by party,
and writes a report next to the source PDF. Legal nuance is past local-model reach, so this one uses a hosted model —
the worker prompts for your API key on first run and saves it.

Cascade: CODE for text extraction and report writing. HOSTED for party identification and obligation extraction.

## Future improvements

Out of scope for v1, on the roadmap:

- **Workers marketplace.** Browse and install workers other people have forged.
- **Code-signing.** Sign Windows and macOS artifacts so recipients don't see the first-run security warning.
- **An update channel.** Push reforged versions of a worker to recipients without re-emailing the binary.
- **Auto-reforge on failure.** When a worker stops completing its task — an API changed, a site moved, a model
  deprecated — Worker Forge reforges it from the original spec until it works again.
- **A desktop UI for Worker Forge.** Today the interview happens in a chat; a desktop app would open the same flow to
  people who don't use a chat client.
- **A CLI for power users.** Skip the interview and pass the spec on the command line.
- **Automated security scanning.** The Forge produces source you can read, but a scanner would catch the obvious classes
  of mistake before the build.
- **Cross-platform scheduling helper.** Today you wire the schedule into your OS scheduler. A thin scheduler shipped
  with each worker could remove that step.
- **Artifact attestation.** A built binary should be verifiable against the source in the Workshop, so a recipient knows
  what they're running.
- **Smarter local-model selection.** Different machines have different models installed. The runtime could query and
  pick the best available rather than pin one at forge time.

## Learn more

- [`worker.md`](./worker.md) — what a worker is and isn't.
- [`design.md`](./design.md) — how Worker Forge, the Workshop, and workers fit together.

## License

MIT. See [LICENSE](./LICENSE).
