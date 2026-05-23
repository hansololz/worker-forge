# Reforge

A reforge is what happens when the user comes back with a change to an existing worker. It's the common case after the first build, and it's the test the Workspace has to pass: if you can't reconstruct enough context from `AUTHORING.md` and `WORKER.md` to make a confident change, the original interview failed.

## The flow

1. Read `WORKER.md` first. The frontmatter tells you what the worker is for; the cascade plan tells you the units it's composed of. This is the spec.
2. Read `AUTHORING.md` next. This is where you'll find why each decision was made — why SQLite over JSON, why LOCAL not HOSTED for the summary, why the data goes to `~/Documents` and not the worker's own folder. The rationale layer is what makes a change confident instead of a guess.
3. Find the unit (or units) the change touches. Most reforges hit one unit. "Add a slack notification when the digest is ready" probably adds a new unit, doesn't change anything existing. "Make the summary more concise" changes the prompt of an existing LOCAL unit. "Switch from Anthropic to OpenAI for the summary" changes the provider on a HOSTED unit.
4. Make the change in `build/main.py`. Update the cascade plan in `WORKER.md` if the change is structural (added unit, changed tier, swapped model).
5. Append to `AUTHORING.md` — don't rewrite it. The original transcript and decisions stay; you're adding a "reforge `<date>`" section that explains what the user asked for and what you changed.
6. Rebuild. Same packaging step as the initial forge. If the host OS matches the target and the user is OK with it, run the build; otherwise hand them the build script.

## When to do a full regenerate

Sometimes the change is big enough that patching is messier than starting over. Triggers:

- The task fundamentally changed (the worker used to file receipts; now the user wants it to also handle invoices and tag by department — that's a different worker).
- The cascade plan is no longer a useful description of what the worker does (more than half the units would change).
- The user wants to switch UI frameworks, or switch from no-GUI to GUI, or vice versa.

In these cases, archive the existing Workspace to `root/workspaces/<worker-name>/history/<timestamp>/` and run a fresh forge. The supplement spec and `design.md` agree on this: preserve the old `AUTHORING.md` for reference, but don't pretend the new worker is a small patch on the old one.

## When the Workspace doesn't have enough context

If `AUTHORING.md` and `WORKER.md` don't tell you enough to make a confident change — "the user wants partial-failure behavior to change, but the original interview never covered partial failure" — that's a signal the first forge cut a corner. Run a mini-interview to fill in the missing context, write the answers back into `AUTHORING.md`, then make the change. Don't guess. The whole point of the Workspace is that the next reforge starts from solid ground.

## What to tell the user

After a reforge:

- Summarize what changed in one or two sentences.
- Show the diff to `WORKER.md` (the spec change is the user-facing thing).
- Tell them whether a rebuild was needed and whether you ran it.
- Link them to the updated artifact in `dist/` if a build was produced.

Don't dump the full source. The user trusts the Workspace is auditable; they don't need you to re-prove it every time.
