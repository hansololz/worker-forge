# Worker Forge

## What is Worker Forge

Make it easy to build desktop apps that automates repetitive tasks.

Worker Forge is an agent that turns a plain-language task description into a small, single-purpose program that runs on
your own machine. You describe what you want; the Forge interviews you about the details and produces a *worker* — a
native artifact (`.exe` on Windows, `.app` on macOS, AppImage or static binary on Linux) that does one job, runs to
completion, and exits. Trigger it with a double-click, a schedule, a cron entry, or an event.

## The problem

A lot of useful desktop work is small, manual, and repetitive: checking a webpage for a specific change, pulling a
daily digest from a set of sources, renaming a folder of files according to their content. These tasks stay manual for
three reasons:

- Automating them costs more time than they save.
- Most users can't write the script themselves.
- General-purpose tools don't cover them — the tasks are too niche.

Automating them with hosted-LLM solutions has three problems:

- **Cost.** Hosted-LLM pricing today is subsidized by investor and corporate capital, subject to change, and may become
  cost prohibitive.
- **Availability.** Providers shut down and deprecate models on their own schedule.
- **Connectivity.** Hosted calls require an internet connection at run time while many of these tasks could run on a
  laptop in airplane mode.

## Examples

### Daily news digest

The worker pulls articles from a configured set of RSS feeds, deduplicates by URL, clusters near-duplicates, summarizes
each cluster, and writes a Markdown briefing to `~/Documents/digest.md`. Fetching, dedup, and output are deterministic;
clustering and summaries are fuzzy enough to need a model but small enough for a local one. Wire it into Task
Scheduler, launchd, or cron and walk away.

Cascade: CODE for fetch, dedupe, and output. LOCAL for clustering and summaries. No hosted calls.

### Expense receipt filer

The worker watches `~/Receipts/Inbox` for new files — PDFs the hotel emailed, photos snapped on a phone, screenshots of
ride receipts. For each one it extracts the vendor, date, and total, renames the file to
`YYYY-MM-DD_<vendor>_<amount>.pdf`, files it into `~/Receipts/<YYYY-MM>/<trip-name>/`, and appends a row to a running
`expenses.csv` the finance team imports. Invoice-style PDFs fall into CODE (text extraction plus a regex for the
total); photos and screenshots fall through to LOCAL (a vision-capable model via Ollama). Anything the worker can't
parse confidently lands in a `review/` folder for the user to fix by hand. No receipt data leaves the laptop.

Cascade: CODE for clean PDFs, dedup, renaming, filing, and CSV output. LOCAL for image-based receipts. No hosted
calls.

## Future improvements

Out of scope for v1, on the roadmap:

- **Workers marketplace.** Browse and install workers other people have forged.
- **Code-signing.** Sign Windows and macOS artifacts so recipients don't see the first-run security warning.
- **A remote update channel.** Push reforged versions of a worker to recipients without re-emailing the binary.
- **Auto-reforge on failure.** When a worker stops completing its task — an API changed, a site moved, a model
  deprecated — Worker Forge reforges it from the original spec until it works again.
- **A desktop UI for the Forge itself.** Today the interview happens in a chat; a desktop app would open the same flow
  to people who don't use a chat client.
- **A CLI surface for workers.** Skip the interview and pass the spec on the command line.
- **Automated security scanning.** The Forge produces source you can read, but a scanner would catch the obvious
  classes of mistake before the build.
- **Cross-platform scheduling helper.** Native schedulers — Windows Task Scheduler, launchd, cron — all work
  differently. A thin cross-platform scheduler shipped with each worker could remove that step.
- **Artifact attestation.** A built binary should be verifiable against the source in the Workspace, so a recipient
  knows what they're running.
- **Smarter local-model selection.** Different machines have different Ollama models installed. The runtime could query
  the host and pick the best available rather than pin one at forge time.

## Learn more

- [`design.md`](docs/design.md) — what a worker is and isn't, the cascade as runtime contract, the Workspace layout, the
  forge / run / reforge lifecycles, key design decisions, and known failure modes.

## License

MIT. See [LICENSE](./LICENSE).
