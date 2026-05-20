# The forge interview

The interview is the highest-leverage phase of a forge. A worker is only as good as the description it was built from,
and most users underspecify on the first try — not because they're being lazy, but because the parts of a task that
matter for correctness are usually invisible until something goes wrong. Your job here is to make those parts visible
*before* you write code.

## Frame

Don't open with "tell me everything about the task." Open by reflecting back what you already heard and asking the user
to confirm it before drilling in:

> So you want a worker that watches your Downloads folder and renames any new PDF based on the date inside the file. Is
> that the gist, or am I missing something?

Once they confirm the gist, move to the critical-journey questions below.

## Critical-journey questions

These are the questions that actually shape the worker. Ask them with `AskUserQuestion` so the user picks concrete
options rather than waving their hand. Skip questions already answered earlier in the conversation.

### 1. Target OS

Which machine will the worker run on?

- Windows
- macOS
- Linux

This decides the build script and the artifact extension. PyInstaller can't cross-compile, so the user (or you, if your
host matches) builds for one target.

If the user says "all of them" or "I don't know yet," ask which machine they'll run it on most often and start there.
Multi-target builds are a per-OS rebuild, not a forge-time decision.

### 2. Trigger

How does the worker start running?

- **Click.** Double-click the built artifact.
- **Schedule** (daily, hourly, weekdays).
- **Cron** (a recurring expression).
- **Event** (file dropped in a folder, webhook, OS notification).

The worker itself doesn't install the schedule — the user does that in Task Scheduler / launchd / cron. The worker just
exits cleanly so it composes with a scheduler. Make sure the user understands that.

### 3. Input

What does the worker operate on? Common shapes:

- A file or folder the user drops onto the artifact (`sys.argv[1]`).
- A path hardcoded into the worker.
- A URL or list of URLs.
- No input — the worker reads from a known location (inbox, folder, API).

If the input is a folder, follow up: process every file every time, or only new files since the last run?

### 4. Output

Where does the result go? A worker that does work without telling anyone is invisible. Pick one:

- Writes a file (Markdown, CSV, text) to a specific path.
- Prints to the console.
- Opens a file in the default app.
- Sends a notification (heavy — only if the user explicitly asks).

### 5. Edge cases

The part users skip and pay for later. Probe at least two of:

- **Duplicates.** What counts as "already processed"? Filename, content hash, timestamp?
- **Partial failure.** Processing 100 things and one fails — skip and continue, stop and report, or retry?
- **Empty input.** Nothing to do — what should the worker say or do? Silence is usually wrong.
- **Ambiguity.** Worker has to make a judgment call (which date in a PDF is the "real" one?) — what's the tie-breaker?

### 6. Inference budget

Constrains the cascade in Phase 2. Ask the user what they expect:

- "Just regular code, no AI needed at run time."
- "Probably needs some AI to read messy text, but I'd rather use a local model so it's free."
- "Needs a frontier model — I'll provide an API key."

If they pick local-first, the cascade should treat hosted LLM as a hard escape hatch, not a default.

## Closing the interview

Once you have answers, write a one-paragraph spec and read it back:

> Here's what I'm going to build: a worker for Windows that watches `C:\Users\David\Downloads`, picks up any new PDF,
> extracts the document date from the first page using a local model, and renames the file to
`YYYY-MM-DD_<original-name>.pdf`. If it can't find a date, it leaves the file alone and writes a one-line note to
`~/Documents/forge-log.txt`. You'll run it by double-clicking the artifact. Sound right?

Don't move to Phase 2 until the user says yes. If they correct you, update the spec and read it back again. It is much
cheaper to fix the spec than the worker.

The confirmed spec becomes the opening of `AUTHORING.md`. Save it.

## Things to *not* ask about

Spare the user the technical decisions they shouldn't have to make:

- Language choice (always Python for v1).
- Packaging format (always single-file via PyInstaller).
- Which specific model the cascade uses (you pick based on the task).
- Threading, async, virtualenvs.

If the user is technical and volunteers preferences, fine. But don't surface these as questions — they're noise to a
non-developer.
