# design-sync notes — worker-forge

## Shape / how this repo syncs
- worker-forge is an **Electron app**, not an npm component library. The design
  system is `src/ui.jsx` (6 components) styled by `src/index.css` (OKLCH tokens
  + all component classes). There is **no component `dist` build** — the root
  `dist/` is the Electron installer output.
- The bundle is built directly from source: `--entry ./src/ui.jsx`. esbuild
  bundles it (incl. `@fortawesome/*` inlined) into `window.WorkerForge`.
- `pkg: "worker-forge"` is NOT resolvable in `node_modules` (package `main` is
  `out/main/index.js`, the Electron main process). That's fine — preview
  `import { X } from 'worker-forge'` is rewritten to `window.WorkerForge` by the
  story-imports plugin. Don't try to `npm install` the package.

## Build / validate commands
- Build: `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./src/ui.jsx --out ./ds-bundle`
- Validate/capture need env: `NODE_PATH="$PWD/node_modules"` (playwright resolves
  from the repo's own node_modules) and `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"`
  (chromium-headless-shell v1228 installed there for playwright 1.61.1).

## Config specifics
- Components are **plain JS with no `.d.ts`** — prop interfaces are hand-written
  in `cfg.dtsPropsFor` for all 6. **If a component's function signature changes
  in src/ui.jsx, update its dtsPropsFor body** or the `.d.ts` contract goes stale.
- `cfg.componentSrcMap` explicitly lists all 6 → `src/ui.jsx` (discovery can't
  infer them without a `.d.ts` tree).
- Fonts: IBM Plex Sans (400/500/600/700) + Mono (400/500/600) wired via
  `cfg.extraFonts` pointing at `node_modules/@fontsource/*/…css`. Referenced by
  the CSS as `--sans`/`--mono` but the `@font-face` lives in main.jsx imports,
  not index.css — hence extraFonts.
- `ConfirmModal` renders as a portal overlay → `cfg.overrides.ConfirmModal`
  = `{cardMode:single, primaryStory:Danger, viewport:820x560}`.

## Known render warns (triaged legitimate)
- None outstanding — render check is 6/6 clean after authoring all previews.
  (Before authoring, `Dot`/`Icon` floor cards flagged RENDER_BLANK/THIN because a
  single tiny element doesn't fill a card — resolved by the authored previews.)

## Re-sync risks (watch-list)
- **Component set drift**: adding/removing an exported component in `src/ui.jsx`
  requires matching edits to `componentSrcMap` AND `dtsPropsFor`. Neither is
  auto-derived here.
- **Token/class renames**: `.design-sync/conventions.md` enumerates real token
  names from `src/index.css`. If tokens are renamed, re-run the conventions
  validation (grep the header's names against the built `_ds_bundle.css`).
- **Select open/searchable state is interaction-only** — previews show the
  closed control; the popover/search box cannot render statically. This is
  intentional, not a capture failure. Same for Btn hover/active.
- **Grouping**: all 6 components are in the `general` group (the repo has no doc
  categories). To split into sections (Actions/Status/Forms/Feedback), add
  `cfg.docsMap` stubs with `category:` frontmatter — optional polish.
- **extraFonts paths** point into `node_modules/@fontsource` — a clean reinstall
  keeps them; a @fontsource major bump could move files (re-check the list).
