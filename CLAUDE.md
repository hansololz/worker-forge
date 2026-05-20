# Writing Markdown for Developers

Use this guide when writing any `.md` file whose audience is developers: READMEs, RFCs, design docs, internal runbooks,
API guides, migration notes, postmortems.

The reader is a working engineer with limited time. They open the doc to answer a question, ship a change, or unblock
themselves. They will skim before they read. They will leave if the first paragraph wastes their time.

## Rules

1. **Lead with the problem and the stakes.** First paragraph states what this doc is for and why it matters to the
   reader. No throat-clearing, no history of the project, no welcome message.
2. **One claim per sentence.** Short sentences. Active voice. Period.
3. **No fluff words.** Cut: *simply, just, easily, powerful, robust, seamless, elegant, leverage, utilize, in order to,
   please note that, it is important to.* If a sentence survives deletion, delete it.
4. **No wordplay, no clever headings, no metaphors.** "Authentication" beats "Who goes there?". The reader is grepping.
5. **Show the code.** Any claim about behavior gets a runnable snippet. Snippets are minimal, copy-pasteable, and
   include the language tag.
6. **Concrete over abstract.** Real values, real paths, real error messages. Not `foo` and `bar`.
7. **State invariants and failure modes.** What breaks, when, and what the error looks like. Engineers debug by
   searching for error strings — put them in the doc.
8. **Front-load decisions.** Recommendations, defaults, and the "use X unless Y" rule appear before the explanation of
   how X works.

## Structure

Default skeleton for a technical doc:

```
# Title (what this is)

One paragraph: what problem this solves, who should read it, what they'll be able to do after.

## TL;DR / Quickstart  (if applicable)
Minimum commands or code to get a working result.

## Concepts  (only if needed to use the thing)
Define terms the rest of the doc relies on. Skip if obvious from context.

## Usage / API
Reference material. Tables for parameters. Code for examples.

## Failure modes
Known errors, their cause, the fix.

## See also
Links to related docs.
```

Drop sections that don't apply. A doc with no failure modes section is fine if there are none worth listing. A doc with
a "Background" section the reader can skip is a doc that wastes the reader's time.

## Headings

- Use sentence case (`## Handling rate limits`, not `## Handling Rate Limits`).
- Headings are descriptive, not catchy. `## Authentication` not `## Locking the door`.
- Don't skip levels. `##` then `###`, not `##` then `####`.
- Avoid more than three levels of nesting. If you need four, split the doc.

## Code blocks

- Always tag the language: ` ```python `, ` ```bash `, ` ```json `.
- Snippets run as written. No pseudocode unless labeled `pseudocode`.
- Show the command and a sample of its output when the output matters.
- For shell, prefix lines the user types with `$ ` only if mixing input and output. Otherwise no prefix — easier to
  copy.
- Long examples go in a fenced block, not inline.

## Lists vs. prose

- Use a list when items are parallel, independent, and order doesn't carry meaning beyond enumeration.
- Use prose when the relationship between ideas is causal or sequential and the connective tissue ("because", "then", "
  unless") carries information.
- Don't bullet a single sentence into four fragments.

## Tables

Use tables for reference material with consistent columns: parameters, error codes, version compatibility, flag
descriptions. Don't use tables for narrative content.

## Links

- Link text describes the destination: `see [the retry policy](./retry.md)`, not `see [here](./retry.md)` or
  `click [this link](./retry.md)`.
- Link to specific sections, not whole pages, when you mean a specific section.
- Prefer relative links inside a repo so they survive moves.

## Tone

Professional, neutral, factual. Write the way a senior engineer writes a code review comment: direct, specific, no
posturing. No exclamation points. No emoji. No "we" unless you mean a specific team and the reader knows who that is.
Prefer the imperative ("Set the timeout to 30s") over the conditional ("You might want to consider setting the timeout
to 30s").

## Anti-patterns

- **Marketing intros.** "In today's fast-paced world of distributed systems..." Delete.
- **Restating the title.** A `# Caching` heading followed by "This document describes caching." Delete.
- **Tutorials that explain the tutorial.** "First we'll cover X, then Y, then Z." Just do X, Y, Z.
- **Apologetic hedging.** "This might be a bit confusing, but..." If it's confusing, fix the explanation.
- **Decorative formatting.** Bold on every other word. Headers for two-sentence sections. Tables of contents on a
  200-line doc.
- **Stale examples.** Code that no longer runs against the current API is worse than no example.

## Before and after

Before:

> Welcome to the documentation for our powerful new authentication system! In this guide, we'll walk you through
> everything you need to know to get started. Authentication is a critical part of any modern application, and we've
> worked hard to make it as simple and elegant as possible.

After:

> This service issues short-lived JWTs from an OIDC provider. Use it for any internal service that needs to authenticate
> requests from another internal service. Tokens expire in 15 minutes; clients must refresh.

The second version answers three questions in three sentences: what it is, when to use it, what the reader needs to know
to not get paged at 2 a.m.

## Final check

Before publishing, re-read with one question: **what would a reader who needs this doc at 11 p.m. on a Friday want cut?
** Cut it.
