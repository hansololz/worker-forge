# Reforge

A reforge is what happens when the user comes back to an existing worker. It's the common case after the first build, and it's the test the Workspace has to pass: if you can't reconstruct enough context from `AUTHORING.md`, `WORKER.md`, and `<os>/<os>-specific.md` to make a confident change, the original interview failed.

There are two distinct flavors of reforge. Most of the time it's the first one. The second shows up enough that it's worth knowing on sight.

## Flavor 1 — change to an existing worker on the same OS

The user wants to change behavior in a worker they already have on this OS. Pretty much every "make the digest shorter", "add a Slack notification", "switch from Anthropic to OpenAI" lands here.

1. Read `WORKER.md` first. The frontmatter tells you what the worker is for; the cascade plan tells you the units it's composed of. This is the spec.
2. Read `AUTHORING.md` next. This is where you'll find why each common decision was made — why SQLite over JSON, why LOCAL not HOSTED for the summary, why the data shape looks the way it does. The rationale layer is what makes a change confident instead of a guess.
3. Read the relevant `<os>/<os>-specific.md` if the change touches anything OS-shaped (data location, scheduler glue, UI framework, keychain).
4. Find the unit (or units) the change touches. Most reforges hit one unit. "Add a Slack notification when the digest is ready" probably adds a new unit, doesn't change anything existing. "Make the summary more concise" changes the prompt of an existing LOCAL unit. "Switch from Anthropic to OpenAI for the summary" changes the provider on a HOSTED unit.
5. Make the change in `<os>/main.py` (and in any other OS folders that share the unit — same edit, applied to each). Update the cascade plan in `WORKER.md` if the change is structural (added unit, changed tier, swapped model).
6. Append to `AUTHORING.md` (or to `<os>-specific.md`, whichever the change belongs in) — don't rewrite. The original transcript and decisions stay; you're adding a "reforge `<date>`" section that explains what the user asked for and what you changed.
7. Update the workspace `README.md` if the change touched the feature list, the build commands, or the run commands. The README is part of the source of truth; don't leave its feature bullets or commands describing the old worker.
8. Rebuild. Same packaging step as the initial forge. If the user is OK with it, run `<os>/build_<os>.{bat,sh}`; otherwise leave the script in place.

You **must** keep the docs in sync with the worker whenever you modify it — `WORKER.md`, `AUTHORING.md`, the relevant `<os>-specific.md`, and `README.md`, each when the change affects it. A reforge that updates the code but leaves the docs stale isn't done. Record anything worth knowing for a future forge while you still have the context.

## Flavor 2 — build the same worker on a new OS

The user already has the worker on, say, Windows, and now they're on a Mac asking for the same worker there. The Workspace already exists with a `windows/` folder; you're adding a sibling `mac/` without touching the original. (Only macOS and Windows are supported today — adding a `linux/` folder isn't possible yet; Linux is a future release. If the user is on a Linux box, tell them Linux isn't supported yet rather than starting this flow.)

1. Read `WORKER.md` and `AUTHORING.md`. Everything in there carries over — the task description, the cascade plan, the data shape, the edge-case decisions, the trigger style, the schedule the user wants, the hosted-model picks, the worker's name. You don't re-ask any of it.
2. Look at the existing `<other-os>/<other-os>-specific.md` files for context. They're not the right answers for the new OS, but they tell you what kind of questions need answers on this OS too. ("Last time on Windows we picked Tkinter and the Credential Manager — on Mac I should ask UI framework and confirm Keychain.")
3. Run only the OS-specific portion of the interview against the user. The full list is in `interview.md` under "What to capture, and where" — UI framework on this OS, data path on this OS, scheduler glue, local-model runtime, keychain, packaging caveats. Keep it short. Most users go "yes, same idea, just whatever's native here," which is fine.
4. Use `setup_workspace.py --add-os` (see `scripts/setup_workspace.py`) to drop a new `<os>/` folder into the existing Workspace. The script refuses to clobber an existing OS folder; it only creates the new one.
5. Fill in the new `<os>/<os>-specific.md` with the answers from step 3.
6. Generate `<os>/main.py` from the cascade plan already in `WORKER.md`. This is the same code path as the initial forge, just sharing the spec; you're not re-deriving it.
7. Add this OS's build and run commands to the workspace `README.md` so it covers every OS the worker now exists for.
8. Offer to build, same as initial forge. Artifact lands in `<os>/dist/`.

Don't re-run the cascade-design phase. The plan is the plan. If a unit happens to need a different model on this OS (say, the user wants `llama3.2:3b` on their Mac instead of `phi3` on Windows), that's a swap inside an existing unit, not a re-plan — record the per-OS model pick in `<os>-specific.md` and move on.

## When to do a full regenerate

Sometimes the change is big enough that patching is messier than starting over. Triggers:

- The task fundamentally changed (the worker used to file receipts; now the user wants it to also handle invoices and tag by department — that's a different worker).
- The cascade plan is no longer a useful description of what the worker does (more than half the units would change).
- The user wants to switch UI frameworks across the board, or switch from no-GUI to GUI, or vice versa.

In these cases, archive the existing Workspace to `root/workspaces/<worker-name>/history/<timestamp>/` and run a fresh forge. Preserve the old `AUTHORING.md` and any old `<os>-specific.md` files for reference, but don't pretend the new worker is a small patch on the old one.

## When the Workspace doesn't have enough context

If `AUTHORING.md`, `WORKER.md`, and the relevant `<os>-specific.md` don't tell you enough to make a confident change — "the user wants partial-failure behavior to change, but the original interview never covered partial failure" — that's a signal the first forge cut a corner. Run a mini-interview to fill in the missing context, write the answers back to the right file (common stuff to `AUTHORING.md`, OS-specific stuff to `<os>-specific.md`), then make the change. Don't guess. The whole point of the Workspace is that the next reforge starts from solid ground.

## What to tell the user

After a reforge:

- Summarize what changed in one or two sentences.
- Show the diff to `WORKER.md` if the spec moved (it usually does for behavior changes, usually doesn't for new-OS builds).
- Tell them whether a rebuild was needed and whether you ran it.
- Link them to the updated (or new) artifact in `<os>/dist/` if a build was produced.

Don't dump the full source. The user trusts the Workspace is auditable; they don't need you to re-prove it every time.
