# Worker

A worker is a single-purpose, locally-executed program that does one repetitive task well. The user runs it on their own
machine — by clicking, by schedule, by cron, or by event — and the work happens without an mandatory online subscription
or a developer in the loop.

Read this if you're deciding what to build, reviewing a `WORKER.md`, or trying to figure out whether a request belongs
in a worker or somewhere else.

## TL;DR

- One worker, one job.
- Runs locally. No mandatory cloud dependency.
- Falls back through a cascade: deterministic code, then a local LLM, then a hosted LLM as last resort.
- Produced by the Worker Forge from a plain-language description. Stored in a Workshop. Distributed as a built artifact
  for the target OS.

If the deliverable is more than one job, isn't local-first, or needs a server to function, it isn't a worker.

## Why local-first

Online LLMs are getting more expensive, not less. Today's prices are propped up by VC subsidies; when that money runs
out, the real cost lands on the user. Providers go down, change pricing, deprecate models, or shut down
entirely. A worker that depends on a hosted model inherits all of that risk.

Local hardware and small models are moving the other direction. A worker built today should bet on the local side of
that curve. Hosted models are an escape hatch for tasks that genuinely need frontier judgment — not the default path.

## The execution cascade

Every worker runs each unit of work through a cascade. The cheaper and more deterministic tier runs first. The worker
escalates only when the current tier can't satisfy the unit.

| Tier  | Mechanism                                  | Use for                                                   |
|-------|--------------------------------------------|-----------------------------------------------------------|
| CODE  | Deterministic logic (regex, parser, HTTP)  | Anything expressible as a precise rule                    |
| LOCAL | Local LLM (e.g., Ollama on the user's box) | Fuzzy classification, small summaries, simple extractions |
| LAST  | Hosted LLM with the user's API key         | Tasks that need frontier-model judgment                   |

Most units are CODE. Reach for LOCAL only when no deterministic rule fits. Reach for the hosted tier only when LOCAL is
unreliable for the unit at hand.

The cascade plan for a given worker is recorded in its `WORKER.md` so a future reforge can read it before touching the
code.

## How a worker is triggered

A worker exposes one or more of these entry points:

- **Click.** The user double-clicks the built artifact.
- **Schedule.** The worker runs at a fixed time (daily, hourly).
- **Cron.** A recurring expression on the user's machine drives it.
- **Event.** Another process invokes the worker when some condition fires.

A worker runs, finishes, and exits. It is not a long-running service.

## What a worker looks like on disk

Workers live inside a Workshop. Each worker is one folder:

```
workshop/workers/<worker-name>/
├── AUTHORING.md     # original task description, interview notes, key decisions
├── WORKER.md        # plain-language entry point: what it does, trigger, cascade plan
├── resources/       # prompts, schemas, templates, sample inputs needed at run time
├── build/           # build tools and scripts for the target OS
└── dist/            # the built artifact (e.g., my-worker.exe, my-worker.app)
```

`WORKER.md` is structured like a skill: it starts with a metadata block (`name`, `description`) and reads as the
worker's plain-language spec. `AUTHORING.md` captures the interview and decisions that produced the worker, so a future
change has the context it needs.

## Invariants

These hold for every worker. Break any one of them and the artifact isn't a worker — it's something else.

1. **Single responsibility.** One worker does one job. Two jobs means two workers.
2. **Local-first execution.** The worker runs without an internet connection unless a specific unit has escalated to the
   hosted tier and the user has chosen to allow it.
3. **The recipient is not the author.** Setup steps, prompts, error messages, and outputs make sense to someone who
   didn't write the spec.
4. **Cheapest tier first.** A model call where a regex would do is a bug.
5. **Reforgeable.** `AUTHORING.md` and `WORKER.md` contain enough context for the Worker Forge to modify the worker
   later without starting over.

## When not to build a worker

Don't forge a worker for:

- **One-off tasks.** "Summarize this one PDF for me" is a request, not a worker. Do the task and move on.
- **Multi-screen applications.** UI flows, user accounts, persistent server state — that's an app.
- **Long-running services.** Streaming, daemons, anything that doesn't terminate. A worker exits.
- **Tasks that fundamentally require a server backend the user doesn't own.** A worker can call APIs, but it can't be a
  server.

If the user describes one of these, push back. Narrow the request to the piece that fits the worker shape, or tell them
this isn't a worker-shaped problem.

## Related concepts

- **Worker Forge.** The agent skill that interviews the user, designs the cascade, generates the source, and packages
  the worker.
- **Workshop.** The directory the Forge writes into. Holds every worker the user has forged plus the resources to
  rebuild them.

## See also

- [Worker Forge skill](../../AppData/Roaming/Claude/local-agent-mode-sessions/skills-plugin/eeddb6ca-eeb2-4176-bd32-367747574a67/abe2a79e-4acc-431e-b0da-f9a1b42949d3/skills/worker-forge/SKILL.md) —
  the forge cycle that produces a worker.
- [`initial-context.md`](./initial-context.md) — the project's terminology and goals.
