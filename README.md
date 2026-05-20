# Worker Forge

Turn a plain-language task into a portable program that runs on your own machine. You describe what you want; you walk
away with a single file you can double-click, schedule, or hand to a friend. The program is called a *worker*.

## The problem

A lot of useful desktop work is small, manual, and repetitive: rename a folder of PDFs by the date inside each one,
summarize today's downloads, check a page for changes, build a weekly digest from a few feeds. Each task is too small to
justify hiring a developer, but you do it forever.

The obvious fix — wire it to a hosted LLM — has three problems:

1. **Cost.** Hosted-LLM prices today are propped up by VC subsidies. When subsidies end, you pay the real number.
2. **Availability.** Providers shut down, deprecate models, and change pricing on their own schedule. A tool that
   depends on a specific hosted model can break overnight.
3. **Connectivity.** Hosted calls require an internet connection at run time. Many useful tasks should run on a laptop
   in airplane mode.

Worker Forge bets the other way. Local hardware keeps getting better. Small models keep getting more capable. And a lot
of subtasks don't need a model at all. The system produces programs that lean on deterministic code first, a local model
second, and a hosted model only as a last resort. Most workers never make a network call.

## How it works

A worker walks a three-tier cascade at run time:

1. **CODE** — deterministic Python (regex, parser, HTTP, library call). Most work happens here.
2. **LOCAL** — a small LLM running on your machine via Ollama. For fuzzy classification, short summaries, simple
   extractions.
3. **HOSTED** — a frontier model with your own API key. Only when the cheaper tiers can't.

Worker Forge interviews you about edge cases, output location, error behavior, and target OS. It writes the worker into
your *Workshop* (a persistent folder on your machine), builds the artifact for Windows / macOS / Linux, and hands you
the result.

One worker, one job. The worker runs and exits — no daemons, no servers. It triggers from a double-click, a schedule, a
cron entry, or an event.

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
