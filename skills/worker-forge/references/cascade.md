# Cascade

The cascade is the runtime contract every worker honors. For every unit of work the forge picks the cheapest tier that can do the job reliably — CODE before LOCAL, LOCAL before HOSTED. The cheaper tier is always faster, more available, and more predictable than the one above it, so reaching for a higher tier without cause makes the worker worse at run time.

The escalation between tiers is a *forge-time* decision, recorded in the cascade plan. `design.md` is explicit about this: "The escalation is recorded in the cascade plan; it isn't a silent run-time fallback." So when LOCAL turns out not to be reliable enough for a unit during forge-time evaluation, you change the unit's tier in the plan and rebuild — you don't paper over it with a runtime escalation chain.

There's one narrow exception: a unit whose input genuinely varies in shape. The receipt-filer example below uses CODE for clean PDFs and LOCAL for image receipts; this isn't a fallback in the "LOCAL gave up, try HOSTED" sense, it's two paths that the unit chooses between based on the input. The runtime supports this via the explicit `fallback=` argument when registering a unit, and the cascade plan should name both paths so a reader can see what's happening.

The point isn't only that the cascade is cheap. It's that the cascade forces you to pick a tier at design time instead of reaching for a model call by default. A worker built this way keeps working when a hosted model is unavailable, when the user is offline, and when a provider changes its terms.

## The tiers

| Tier   | Mechanism                                  | Use for                                                   |
|--------|--------------------------------------------|-----------------------------------------------------------|
| CODE   | Deterministic logic (regex, parser, HTTP)  | Anything expressible as a precise rule                    |
| LOCAL  | Local LLM via Ollama on the user's machine | Fuzzy classification, small summaries, simple extractions |
| HOSTED | Hosted LLM with the user's API key         | Tasks that need frontier-model judgment                   |

### CODE

A function. No model in the loop. Examples that are CODE and shouldn't be anything else:

- Parsing a date out of a filename — regex.
- Detecting "is this file a PDF" — magic bytes, or trust the extension if the worker controls how files get there.
- Fetching an RSS feed and dedupe by URL — HTTP + a `set()`.
- Renaming files according to a pattern — `os.rename` plus a format string.
- Summing a column in a CSV — `csv.reader`.

The temptation is to use a model because it's faster *to write*. Resist. The model call adds latency, fragility, and a dependency the worker doesn't otherwise have. If the task can be written as a rule, write it as a rule.

### LOCAL

A small instruction-tuned model running on the user's machine via Ollama (or the platform's built-in inference, if the user picked OS MODELS in the interview). Good for tasks that are fuzzy but small:

- Classifying a document as "invoice" or "receipt" given the text.
- Generating a one-line summary of a short article.
- Extracting structured fields from semi-structured text where regex would be too brittle.
- Categorizing a screenshot as "restaurant receipt", "ride receipt", "hotel folio" (vision-capable local model).

LOCAL is the right call when the task is genuinely fuzzy but the input is small and the user doesn't need frontier-model judgment. Default models: `llama3.2:3b` for text-only at low latency, `llama3.1:8b` for slightly bigger tasks, `llava` for vision. The user can override in the interview.

LOCAL units add a setup step (the model has to be installed on the user's machine). The runtime handles this — it checks for the model on first run, pulls it via `ollama pull` if missing, and logs a clear message. If the user agreed to a bundled setup script in the interview, ship it in `resources/setup_local_models.{sh,bat}`.

### HOSTED

A hosted frontier model called with the user's API key. Reserve for tasks that need the kind of judgment a small local model can't fake:

- Summarizing a fifty-page contract.
- Drafting a customer-facing email from rough bullet points.
- Reasoning through a multi-step plan where the steps depend on each other.
- Tasks where the user has explicitly asked for "the best model you can get."

HOSTED units make the worker dependent on internet connectivity, on the provider being up, on the user having a working key. That's a real cost — note it in `WORKER.md` so the recipient knows what they're committing to.

**Picking the model is part of picking the tier.** HOSTED isn't one choice, it's a provider *and* a model, and the cheapest-tier-first instinct doesn't stop at the tier boundary — it keeps going inside HOSTED. Every frontier provider ships a lineup that trades capability for cost and latency, roughly three rungs:

- **Top tier** (Anthropic's Opus line, OpenAI's flagship, Gemini Pro) — for units that need real frontier judgment: long-context reasoning, multi-step plans, a fifty-page contract. This is the rung where reaching for the newest Opus is the right call.
- **Balanced tier** (Anthropic's Sonnet line, OpenAI's mid model, Gemini Flash) — the default for most HOSTED units. Drafting an email, a structured extraction the local model fumbled, a moderate summary. Fast, and a fraction of the top-tier cost.
- **Fast/cheap tier** (Anthropic's Haiku line, the smallest hosted model) — high-volume or latency-sensitive units where the judgment bar is low but LOCAL still wasn't reliable enough.

Default a HOSTED unit to the balanced tier; step up to the top tier only when the unit genuinely needs frontier judgment. Calling the biggest, slowest, priciest model to rewrite a subject line is the HOSTED-tier version of using an LLM where a regex would do — except here the waste shows up on the recipient's bill every single run. The contract-summarizer below is a real top-tier case; most HOSTED units aren't.

Model identifiers churn — providers ship new versions and deprecate old ones on their own schedule (`design.md` flags this as a core risk). Don't pin a worker to a model string you half-remember. Decide the tier, confirm the current identifier (ask the user, or check the provider's current model list), and write the verified `<provider>/<model>` into the cascade plan. A worker pinned to a model that's since been retired fails on its first hosted call, offline-style, with no fallback.

The runtime prompts for the API key on first need and stores it in the OS keyring (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux). The user can also set it ahead of time so the prompt never fires. If the worker has no HOSTED units, the prompt code never runs — no surprise pop-ups.

## How to pick the tier

The decision is usually obvious. When it isn't, work down this list:

1. **Can a clear rule describe the right answer?** If yes, CODE. Regex, parser, HTTP, a state machine, whatever fits.
2. **Is the input small (< a few thousand tokens) and the task fuzzy but bounded?** If yes, LOCAL.
3. **Does the task need real reasoning or long-context understanding?** If yes, HOSTED.
4. **Are you still unsure?** Default to the lower tier and test it. It's much easier to escalate a unit after seeing it fail than to drop one down after building around a model call.

A note on the "obvious" CODE case: a lot of users will describe a task that sounds like it needs a model because that's the vocabulary they have. "Categorize my downloads" sounds like classification. "Find the dates in this file" sounds like extraction. Listen for the underlying shape — if a regex or a parser would do, propose that. The skill spec specifically calls this out: when the user's ask seems to need LOCAL, try CODE alternatives first.

## Worked examples

### Daily news digest

The worker pulls RSS feeds, deduplicates, clusters near-duplicates, summarizes each cluster, writes Markdown.

- Fetch feeds → CODE (HTTP + `feedparser`).
- Dedupe by URL → CODE (`set()`).
- Cluster near-duplicates by title similarity → CODE (cosine similarity on TF-IDF is enough); LOCAL only if the user wants semantic clustering that the cheap version misses.
- Summarize each cluster → LOCAL (`llama3.2:3b` is plenty for one-line summaries).
- Write Markdown → CODE.

No HOSTED units. Cascade in `WORKER.md`: `fetch (CODE) → dedupe (CODE) → cluster (CODE) → summarize (LOCAL) → write (CODE)`.

### Expense receipt filer

The worker watches a folder for new files, extracts vendor/date/total, renames and files them, appends to a CSV.

- Detect new files → CODE (`watchdog` or polling).
- Extract text from PDFs → CODE (`pypdf`).
- Parse vendor/date/total from clean PDF text → CODE (regex).
- Same parse from a photo or screenshot → LOCAL (vision model — `llava`).
- Rename + file → CODE.
- Append to CSV → CODE.

The cascade is `detect (CODE) → extract (CODE) → parse (CODE → LOCAL fallback) → file (CODE) → log (CODE)`. The LOCAL fallback only fires when the input is an image; clean PDFs stay all-CODE.

### Contract summarizer

The worker takes a long contract, produces a one-page brief.

- Read PDF → CODE.
- Chunk and structure → CODE.
- Summarize → HOSTED, top tier. Local models lose the thread on long contracts; this is exactly the case for frontier judgment, so this is where a top-tier model (newest Opus, OpenAI flagship, Gemini Pro) earns its cost. Confirm the current identifier before pinning it.
- Write output → CODE.

Cascade: `read (CODE) → chunk (CODE) → summarize (HOSTED, anthropic/<current-opus>) → write (CODE)`. The user needs a key for whichever provider they picked in the interview, prompted on first run. Contrast this with a worker that just rewrites a subject line into something punchier — that's still HOSTED if LOCAL can't do it, but it's a balanced-tier model, not the flagship.

## Writing the cascade plan

The cascade plan goes into `WORKER.md` as a short Markdown block. Format:

```markdown
## Cascade plan

1. **fetch_feeds** (CODE) — pull each configured RSS feed via HTTP, parse with `feedparser`.
2. **dedupe** (CODE) — drop entries whose canonical URL has been seen.
3. **cluster** (CODE) — group remaining entries by title cosine-similarity > 0.8.
4. **summarize** (LOCAL, `llama3.2:3b`) — one-line summary per cluster.
5. **write_digest** (CODE) — render the Markdown briefing to `~/Documents/digest.md`.
```

Each unit gets a name, a tier, and a one-line description of what it does. If the unit has a fallback (CODE → LOCAL when CODE can't handle the input), say so. If it's LOCAL or HOSTED, name the model.

This is the contract a future reforge reads. Keep it tight.

## Showing the plan to the user

When you read the plan back in chat for sign-off (separate from the copy that lands in `WORKER.md`), bracket it so the user can't miss either end. Open with a banner:

```
----------------------------------------
START OF PLAN
----------------------------------------
```

…then the worker name (display name + slug), then the numbered unit list, then a confirmation prompt that's visually set off — its own line, bolded, no ambiguity about what you need from the user. Something like:

> **Reply `confirm` to proceed, or tell me what to change.**

The reason for both edges: the plan is the one decision point before code gets written, and a user who skims past it ends up with a worker built on the wrong tier. The banner makes the start scannable, and the bolded ask makes the "I need a response here" unmissable. Don't bury the confirmation request in a paragraph of plan text — it's the whole point of this step.
