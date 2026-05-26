# Default theme

Every worker with a GUI ships with the same default theme unless the user asked for something else during the interview. The reference is the **Claude desktop app for macOS** — clean, light, lots of breathing room, soft shadows, rounded corners, a single system font. The goal is a worker that looks at home next to that app, next to Linear, next to Notion — not the bare-Tkinter look that screams "Python script with a window stapled on."

If the user picked Dark or USER_PROVIDE for the color theme, skip this file and theme accordingly. But the default is light, and light means *this* light.

## Why a default at all

Worker authors aren't UI designers. Half the GUI workers that come out of this skill would otherwise ship with system-default chrome — a default native title bar over a custom canvas, square 1990s-era buttons, the wrong font, hairline borders that look broken on HiDPI. That look isn't neutral; it makes the worker feel like a debug tool. A single default theme that's *good* means every worker the user builds looks intentional from the first run.

The default below is calibrated against the Claude desktop app because that's the reference users will most often have nearby when they run a worker we built. If you find yourself fighting it, fight it — the goal is "looks good," not "exactly matches these hex codes."

## Preferred stack: Electron + Tailwind CSS

When the host has `npm` on the `PATH`, the default framework is **Electron** with **Tailwind CSS** for styling. The reasons are practical: Tailwind makes the spacing/typography/radius rules below cheap to express, Electron lets the title bar and chrome be themed end-to-end (no fighting OS defaults the way you have to with Tkinter), and the resulting window looks the most like the Claude reference. The interview captures this; if `npm` isn't present, ask the user before falling back to a Python-native GUI framework (Tauri, PySide6, Tkinter), and record the pick in `<os>-specific.md`.

The palette tokens below are written assuming a CSS variable home in Tailwind's `:root`, but they translate directly to a `QPalette` (PySide6), a `ttk.Style` map (Tkinter), or a Tauri stylesheet. Whatever the framework, the tokens come from this file — don't redefine the colors in the worker's source.

## Palette

Claude-desktop adjacent: a near-white canvas, very soft borders, a single warm accent. Stick to these unless the user asked for a custom palette.

| Token            | Hex       | Use for                                                                 |
|------------------|-----------|-------------------------------------------------------------------------|
| `bg.base`        | `#FAFAF7` | Window background, the largest surface; the warm off-white you see in Claude desktop. |
| `bg.surface`     | `#FFFFFF` | Cards, panels, the main content area.                                   |
| `bg.elevated`    | `#FFFFFF` | Inputs, dropdowns, anything that floats — distinguish with shadow, not a different fill. |
| `bg.hover`       | `#F1F0EB` | Hover state on buttons, list rows, menu items.                          |
| `bg.active`      | `#E9E7E0` | Pressed / selected state.                                               |
| `border.subtle`  | `#E7E5DE` | Hairline dividers between panels, input borders at rest.                |
| `border.strong`  | `#D6D3CA` | Stronger dividers when subtle reads as invisible against `bg.surface`.  |
| `text.primary`   | `#1F1F1E` | Headings, body text. Near-black, not pure black — pure black on near-white is harsh. |
| `text.secondary` | `#4A4A47` | Labels, descriptions, secondary copy.                                   |
| `text.muted`     | `#7A7973` | Placeholder text, disabled state, timestamps.                           |
| `accent`         | `#C96442` | Primary buttons, focus rings, active tab underline — Claude's warm terracotta. |
| `accent.hover`   | `#B45638` | Accent on hover.                                                        |
| `success`        | `#2F8F4E` | "Done", "Connected", positive status pills.                             |
| `warning`        | `#B7791F` | "Action required" without being an error.                               |
| `danger`         | `#C0392B` | Error text, destructive button.                                         |

Two things to notice. First, the background isn't pure white — pure white on an LCD reads as sterile and washes out the soft borders. Use `#FAFAF7`. Second, surfaces (`bg.surface`) are pure white on top of the off-white base; that's what gives cards the subtle "sitting on the canvas" look without needing heavy borders. Where you do need elevation, lean on a small shadow (`0 1px 2px rgba(15, 15, 15, 0.04), 0 1px 3px rgba(15, 15, 15, 0.06)`) instead of changing the fill.

## Corners

Round them. Square corners are the single biggest tell that a GUI was thrown together quickly.

- **Window corners**: leave to the OS — the OS already rounds them on macOS and Windows 11, and on Linux it depends on the window manager. Don't try to draw your own.
- **Cards / panels / surfaces**: 12 px radius.
- **Buttons**: 8 px radius.
- **Inputs (text fields, dropdowns)**: 8 px radius.
- **Pills / status badges**: fully rounded (`border-radius: 9999px` in CSS-land, or `radius = height / 2` in code).

The progression matters. Bigger surfaces get bigger radii; small interactive bits get smaller ones. Uniform corners on everything looks toy-like.

## The top-bar rule

**The top bar must match the body color. Never leave it the OS default when the body is `bg.base`.** This is the single most common visual bug in workers generated by this skill, and it makes an otherwise-fine worker look unfinished. On a light theme it's just as bad as on a dark one — the OS will happily draw a slightly-off-shade chrome strip across the top of your warm off-white canvas if you don't tell it not to.

What "top bar" means depends on the framework. In each case, the fix is to draw the title bar yourself or theme it to match the body:

- **Electron (the default when npm is available)**: set `titleBarStyle: 'hiddenInset'` on macOS and `titleBarStyle: 'hidden'` with `titleBarOverlay` configured to use `bg.base` on Windows/Linux. Render the title text and any window controls inside the renderer process with Tailwind classes so the bar matches the body exactly. The macOS traffic-light buttons stay native; that's fine and expected. For Linux, render your own close/minimize/maximize controls or use a library like `custom-electron-titlebar`.
- **Tauri**: set `decorations: false` in `tauri.conf.json` and render the title bar in the webview using the same Tailwind classes you'd use in Electron. Wire up window-drag with `data-tauri-drag-region` on the bar.
- **PySide6 / PyQt**: set `Qt.FramelessWindowHint` and draw a custom title bar widget at the top of the central widget, styled with `bg.base`. Add window-drag handling on the custom bar so the window remains movable.
- **Tkinter**: by default, the window title bar is the OS chrome — never matching `bg.base`. Options: (a) call `root.overrideredirect(True)` and draw your own title bar as the first row in the window using `bg.base` for the background, with a label for the title and a close button. (b) on Windows 10+, use `pywinstyles` or set `DWMWA_CAPTION_COLOR` via `ctypes` so the native title bar follows the app's theme. (a) is the more reliable fix; (b) is less code if you only target Windows.
- **Native (SwiftUI on macOS, WinUI on Windows)**: prefer the platform's title-bar-tint API rather than going frameless. SwiftUI: `.toolbarBackground(Color(hex: "#FAFAF7"), for: .windowToolbar)`. WinUI: `AppWindow.TitleBar.BackgroundColor = ...` plus matching `ButtonBackgroundColor`.

Whichever path you take, the title bar's background must be exactly `bg.base` (or one shade lighter/darker if you want a subtle separator) — *not* the OS default, *not* a slightly-different-shade that catches the eye.

## Typography

- Sans-serif system stack. Don't ship a custom font unless the user asked for one. For Electron, this is one line in Tailwind's config (`fontFamily.sans`); for the Python frameworks, set it once on the root style.
  - macOS: `-apple-system, "SF Pro Text"`
  - Windows: `"Segoe UI Variable Text", "Segoe UI"`
  - Linux: `"Inter", "Cantarell", "Ubuntu"`
- Body: 14 px, regular weight, `text.primary`, line-height 1.5.
- Labels / secondary: 13 px, `text.secondary`.
- Headings: 16–22 px, semibold, `text.primary`.
- Monospace where it's actually code/paths: `"JetBrains Mono"` if available, else `"SF Mono", "Cascadia Mono", monospace`.

Avoid: shadowed text, all-caps headings, anything italic-by-default.

## Spacing

- Page padding: 16 px on small windows, 24 px on anything larger.
- Vertical rhythm between sections: 16 px.
- Inside a card: 12–16 px padding.
- Button padding: 8 px vertical, 16 px horizontal.

The rule of thumb is "more space than you think." Cramped UIs read as toy UIs. The Claude desktop app errs on the side of generous spacing; the workers we build should too.

## Components

A few specific bits the workers will almost always need:

### Buttons

Primary: filled, `accent` background, white text, 8 px radius. Hover: `accent.hover`. No drop shadow — keep it flat.

Secondary: `bg.surface` background, `text.primary` text, 1 px solid `border.subtle` border. Hover: `bg.hover`.

Destructive: `danger` text on `bg.surface` background, 1 px solid `border.subtle` border; hover adds a faint `danger`-tinted overlay (not a fully-red button — that's too loud for a worker).

### Inputs

`bg.surface` background, 1 px `border.subtle` border, 8 px radius, 8 px vertical padding, 12 px horizontal. Focus state: border becomes `accent`, plus a 2 px `accent` ring at 20% opacity (`box-shadow: 0 0 0 2px rgba(201, 100, 66, 0.2)` in CSS). No heavy outer glow.

### Status / activity

When the worker is doing something, show it. A 2-px-tall progress bar at the top of the content area, full width, `accent` color, with the indeterminate animation when there's no progress to report. Workers that just freeze with no feedback are the workers users distrust.

### Empty states

When there's nothing to show (no items yet, no results), don't leave a blank panel. Two lines of `text.secondary`-colored copy in the center: a one-liner about what would normally be here, and a one-liner about how to make something happen. This is the difference between a worker that feels broken on first run and one that feels considered.

## Applying it

How you actually wire this into a framework depends on what the user picked in the interview:

- **Electron + Tailwind (default when npm is available)** — define the palette tokens as CSS custom properties in a single stylesheet (`src/theme.css`) and reference them from Tailwind's `theme.extend.colors` in `tailwind.config.js`. Then everything in the renderer uses Tailwind utilities (`bg-base`, `text-primary`, `rounded-lg`, etc.) that map back to the tokens. `titleBarStyle` set in the main process; custom title bar rendered in the renderer with the same classes as the rest of the body.
- **Tauri** — same CSS-variables-plus-Tailwind setup as Electron. `decorations: false` in `tauri.conf.json`.
- **PySide6 / PyQt** — write a QSS stylesheet using the palette tokens. Set it on the `QApplication` so it cascades. Use `Qt.FramelessWindowHint` plus a custom `QWidget` title bar.
- **Tkinter** — use `ttk.Style().configure(...)` for the widget styles, and set background colors directly on `tk.Frame` / `tk.Toplevel`. Drop the Tk default theme (`style.theme_use('clam')` first — `clam` is the most themeable of the built-ins). Custom title bar via `overrideredirect(True)` as described above.

Whichever framework, the palette tokens come from this file. Don't redefine the colors in the worker's source — paste this palette into the worker's `<os>/resources/theme.{css,json,py}` (whichever shape fits the framework) so a future reforge can find them in one place.

## When to deviate

The user owns the worker. If they say "I want it dark" or "make it blue not terracotta," do that. The default exists so the *uninstructed* case still looks good — it's not a religion. Record any deviation in `AUTHORING.md` so the next reforge doesn't quietly walk it back to defaults.
