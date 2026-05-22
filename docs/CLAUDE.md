# Writing docs

Use this guide whenever you're writing a `.md` file in this repo — README, design doc, RFC, runbook, contributing
notes, whatever. The style here is the same one used in the `skill-creator` skill that ships with Cowork. If you're
ever in doubt about what this is supposed to sound like, go read that skill's `SKILL.md` and copy the energy.

The short version: write like you're talking to a smart colleague who's about to actually use what you're explaining.
Not like you're shipping a spec.

Be concise and cut out filler words and extraditions. **DO NOT** Try to add suspense in th writing.

Be human, don't write like people on LinkedIn.

## What the style is, basically

The reader is a person with judgment, not a compiler running your doc as instructions. They're going to read it once
and then make decisions based on it — sometimes decisions you didn't anticipate. So the most valuable thing you can
give them is *understanding*, not rules. A reader who understands why a thing matters can adapt when their situation
doesn't quite match what's in the doc. A reader who only has the rules is stuck the moment reality drifts.

Compare:

> Set the request timeout to 30 seconds. The default is 5 seconds, which is insufficient for production traffic.

vs.

> Set the request timeout to 30 seconds. The 5-second default was tuned for a chattier internal service and times out
> a lot of legitimate slow requests in production — you'll see this as a spike in `client_timeout_errors` around peak
> hours. 30s gets you below that without making bad requests hang forever.

The second is longer but it answers "why 30?" and "how will I know when this is wrong?" The first version makes the
reader go figure those out on their own.

## How to write it

**Talk to the reader.** Use "you". Contractions are fine. Sound like a person.

**Explain the why.** Anytime you tell the reader to do something, you should be able to answer "why this and not
something else?" Write that answer down. If you can't answer it, you might not actually know yet — figure it out
before you finalize the doc.

**Use theory of mind.** What's the reader going to be confused about? What's the question they'll have *after* the
obvious one? Address those. The skill-creator skill does this constantly, like with:

> The skill creator is liable to be used by people across a wide range of familiarity with coding jargon. [...] So
> please pay attention to context cues to understand how to phrase your communication!

One sentence and it tells the reader something important about who they're writing for, without being preachy.

**Avoid rigid commands when an explanation will do.** "ALWAYS use this template", a wall of MUSTs, all-caps demands —
treat those as yellow flags. If something is truly load-bearing and easy to get wrong, fine, say so plainly. Otherwise
reframe as a recommendation with the reasoning attached, and trust the reader to apply judgment. Skill-creator puts it
this way: "Try to explain to the model why things are important in lieu of heavy-handed musty MUSTs." Same idea here,
for human readers.

**Stay flexible.** Real situations don't always match the doc. Acknowledge it. Phrases like "in the default case", "of
course, if X you can also...", "use your judgment here" tell the reader the doc is a guide, not a constitution.

**Concrete over abstract.** Real values, real paths, real error strings. Two short examples often beat a long
explanation. Engineers debug by Ctrl-F-ing the error they're seeing — put the error in the doc.

**Light warmth is fine.** An aside, a parenthetical, a "good luck!" at the end. Don't force it and don't lean on it,
but don't strip humanity out either. The skill-creator skill ends with "Cool? Cool." and "Good luck!" and the doc is
better for it.

## Structure

Don't be precious about structure. A doc that needs four sections gets four sections. A doc that needs one paragraph
gets one paragraph. Rough guidance:

- Lead with what this is for and who it's for. One paragraph, tops.
- If it's a how-to, put a working basic version near the top so a reader who already knows the topic can grab it and
  go.
- If there are gotchas, surface them — readers debug by searching for the error string they're seeing, so put the
  error string in the doc.
- Link to related docs at the end, not in the middle, unless the link is critical to following the current sentence.

Headings can be casual but should still be descriptive — the reader needs to scan them. "Handling rate limits" is fine.
"Authentication" is fine. "Who goes there?" is too cute and forces the reader to read the body to know what the
section is about.

## What to skip

- **Marketing intros.** "In today's fast-paced world..." — delete.
- **Restating the title.** Heading called "Caching" followed by "This section is about caching." — delete.
- **Walls of MUSTs and NEVERs.** Reserve for the small set of things that are truly non-negotiable. Everything else
  becomes a recommendation with reasoning.
- **Decorative formatting.** Bold on every other word, headings on two-sentence sections, a TOC at the top of a
  200-line doc — none of that. Use formatting when it helps the reader scan, not as decoration.
- **Stale examples.** Code that doesn't run against the current API is worse than no code.

## Final check

Before publishing, re-read the doc and ask: would a smart colleague reading this feel like they understand the
*reasoning*, not just the *rules*? If the answer is "they'd know what to do but not why", go back and add the why.
That's the whole game.
