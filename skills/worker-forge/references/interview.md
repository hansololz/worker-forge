# The forge interview

The interview is the highest-leverage phase of a forge. A worker is only as good as the description it was built from, and most users underspecify on first try — not because they're being lazy, but because the parts of a task that matter for correctness are usually invisible until something goes wrong. Your job here is to make those parts visible *before* you write code.

Everything you collect here also feeds `AUTHORING.md` — the rationale layer that future reforges will read. Capture answers verbatim where it helps, and note rejected alternatives, not just chosen ones.

## Frame

Don't open with "tell me everything about the task." Open by reflecting back what you already heard and asking the user to confirm it:

> So you want a worker that watches your Downloads folder and renames any new PDF based on the date in the file. Is that the gist, or am I missing something?

Once they confirm the gist, move to the critical-journey questions below.

## Critical-journey questions

These are the questions that actually shape the worker. Ask them with `AskUserQuestion` so the user picks concrete options rather than waving their hand. Skip questions that have already been answered in the conversation.

### 1. Trigger

When does the worker run? Pick one or more:

- **Click.** The user double-clicks the artifact.
- **Schedule.** A recurring time (daily, hourly). Wired into the user's OS scheduler — Task Scheduler on Windows, launchd on macOS, cron on Linux. The forge does not register the schedule itself.
- **Cron.** A cron expression on the user's box.
- **Event.** Another process invokes the worker on some condition.

A worker runs, finishes, and exits. It is not a long-running service. If the user describes anything daemon-shaped, push back.

### 2. Target OS

Which OS will the worker run on? Windows, macOS, or Linux. One target per worker. The forge emits the build script for that OS and (with permission) runs it on a matching host. If the host OS does not match the target, the forge hands the build script to the user.

Don't ask "which platform" — ask "which machine will run this." Users name machines, not platforms.

### 3. Input

What does the worker operate on? Common shapes:

- A file or folder the user drags onto the artifact.
- A path hardcoded into the worker.
- A URL or list of URLs.
- No input — the worker reads from a known location (an inbox, a folder, an API).

If the input is a folder, ask: should it process every file every time, or only new files since the last run?

### 4. Output

Where does the result go? A worker that does work without telling anyone is invisible. Pick one:

- Writes a file (Markdown, CSV, text) to a specific path.
- Prints to the console.
- Opens a file in the default app.
- Sends an email or notification (heavy — only if the user explicitly asks).

### 5. Edge cases

This is the part users skip and pay for later. Probe for at least two of:

- **Duplicates.** What counts as "already processed"? Filename? Content hash? A timestamp?
- **Partial failure.** If the worker is processing 100 things and one fails, should it skip and continue, stop and report, or retry?
- **Empty input.** If there's nothing to do, what should the worker say or do? Silence is usually wrong.
- **Ambiguity.** If the worker has to make a judgment call (which date in a PDF is the "real" date?), what's the tie-breaker?

### 6. Inference budget

Some tasks plausibly need an LLM at run time; many don't. Ask the user what they expect:

- "I think this is just regular code, no AI needed at run time."
- "It probably needs some AI to read messy text, but I'd rather use a local model so it's free."
- "It needs a frontier model — I'll provide an API key."

Their answer constrains your cascade design in Phase 2. If they pick "local-first," the cascade should treat hosted LLM as a hard escape hatch, not a default.

### 7. Who else will run this

Is the user the only one running this, or will they hand it to someone else? This shapes error messages, prompts, and the README. The recipient is not the author — but if you know the author is the only audience, you can keep first-run setup terser.

## Closing the interview

Once you have answers, write a one-paragraph spec and read it back:

> Here's what I'm going to build: a worker that watches `C:\Users\David\Downloads`, picks up any new PDF, extracts the document date from the first page using a local model, and renames the file to `YYYY-MM-DD_<original-name>.pdf`. If it can't find a date, it leaves the file alone and writes a one-line note to `~/Documents/forge-log.txt`. The worker is for Windows and runs when double-clicked. Sound right?

Don't move to Phase 2 until the user says yes. If they correct you, update the spec and read it back again. Fixing the spec is much cheaper than fixing the worker.

## Recording the interview

Every answer the user gives becomes a line in `AUTHORING.md`. So do the alternatives you considered and rejected:

> **Trigger.** Manual click. Considered scheduling via Task Scheduler — user wants to run by hand so they can review before re-running.
>
> **Duplicate detection.** Filename match. Considered content hash; rejected because user wants to re-process if they re-download the same file.

These notes are what makes the worker reforgeable. A future change request like "actually, use content hash for dedupe" is cheap if `AUTHORING.md` already says why filename was chosen. It is expensive if the rationale is missing.

## Things to *not* ask about

Spare the user the technical decisions they shouldn't have to make:

- Language choice (always Python for v1).
- Packaging format (always single-file artifact via PyInstaller).
- Which model the cascade uses (you pick based on the task).
- Whether to use threads, async, etc.

If the user is technical and volunteers preferences, fine. But don't surface these as questions — they're noise to a non-developer.
