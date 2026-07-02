# Worker Forge — usage conventions

A **dark-first, token-driven** design system for developer-tool UIs (workflow
orchestration, CI/CD dashboards). Cool near-black surfaces, one warm-orange
accent, IBM Plex Sans + Mono, and a strict status-color system. There is **no
theme provider and no prop-based styling** — the look comes from a single
stylesheet of CSS custom properties, and library components carry their own
fixed classes.

## Setup

Load the design system stylesheet once at the app root — `styles.css` pulls in
the tokens and `_ds_bundle.css` (component styles). It sets the dark canvas
globally:

```css
/* from the DS stylesheet — you get this for free */
body { background: var(--bg-0); color: var(--tx); font-family: var(--sans); }
```

So **build on the dark canvas**. Don't wrap the app in a provider (there isn't
one) and don't set a light background — components are designed for `--bg-0`/
`--bg-1` surfaces and will look wrong on white. Import components from the
package; each renders its own styling:

```jsx
import { Btn, Badge, Select, ConfirmModal } from 'worker-forge'
```

## Styling idiom — use the tokens, never raw colors

Library components (`Btn`, `Badge`, `Dot`, `Select`, `ConfirmModal`, `Icon`)
are **styled internally** — pass their props (`variant`, `status`, `size`…),
don't add `className`/`style` for color. For **your own layout** (panels, rows,
grids around the components), style with these CSS variables — never hardcode
hex:

| Family | Tokens |
|---|---|
| Surfaces (near-black → raised) | `--bg-0` `--bg-1` `--bg-2` `--bg-3` `--bg-4` |
| Borders | `--line` `--line-soft` `--line-hi` |
| Text (bright → dim) | `--tx-hi` `--tx` `--tx-mid` `--tx-lo` `--tx-dim` |
| Accent (warm orange) | `--accent` `--accent-hover` `--accent-deep` `--accent-dim` `--accent-line` `--on-accent` |
| Status | `--st-run` `--st-ok` `--st-fail` `--st-queued` `--st-cancel` `--st-interrupt` `--st-skip` (+ `*-dim` fills: `--ok-dim`, `--fail-dim`, `--run-dim`, …) |
| Radii / shadows | `--radius-sm` `--radius` `--radius-lg` · `--shadow-1` `--shadow-2` `--shadow-pop` |
| Fonts | `--sans` (UI) · `--mono` (code, IDs, values) |

Use `--mono` for anything code-like: identifiers, branch names, versions,
durations, run numbers.

## Status semantics

Statuses are a closed set surfaced by `Badge` and `Dot` via a `status` prop:
`running` `succeeded` `failed` `queued` `cancelled` `interrupted` `skipped`
(the `STATUS` export maps each to its color). Use `pulse` on `Badge`/`Dot` to
signal live, in-flight work. Match the color to meaning — green = success,
red = failure, cyan = running, amber = queued.

## Where the truth lives

Read the bound files before styling: the DS stylesheet (`styles.css` and the
`_ds_bundle.css` it imports — the full token + class source) and each
component's `<Name>.d.ts` (props) and `<Name>.prompt.md` (usage).

## Idiomatic snippet

```jsx
// A run row: library components for the controls, tokens for your own layout.
<div style={{ display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', background: 'var(--bg-1)',
              border: '1px solid var(--line-soft)', borderRadius: 'var(--radius)' }}>
  <Badge status="running" pulse />
  <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>nightly-build</span>
  <span style={{ marginLeft: 'auto' }}>
    <Btn variant="ghost" size="sm" icon="dots" />
    <Btn variant="danger" size="sm" icon="trash">Cancel</Btn>
  </span>
</div>
```
