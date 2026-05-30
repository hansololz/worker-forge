# Default theme

Every worker with a GUI ships with the same default theme unless the user asked for something else during the interview. The references are two: **Tailwind CSS** (for the color tokens, spacing scale, corner radii, and component sizing — the bits Tailwind gets right that ad-hoc CSS gets wrong) and **the Claude Code app on macOS** (for the lived-in feel — warm off-white canvas, soft shadows, unified title bar, single system font, lots of breathing room). The goal is a worker that looks at home next to Claude Code, next to Linear, next to Notion — not the bare-Tkinter look that screams "Python script with a window stapled on."

If the user picked Dark or USER_PROVIDE for the color theme, skip this file and theme accordingly. But the default is light, and light means *this* light.

## Why a default at all

Worker authors aren't UI designers. Half the GUI workers that come out of this skill would otherwise ship with system-default chrome — a default native title bar over a custom canvas, square 1990s-era buttons, the wrong font, hairline borders that look broken on HiDPI. That look isn't neutral; it makes the worker feel like a debug tool. A single default theme that's *good* means every worker the user builds looks intentional from the first run.

The default below is calibrated against Tailwind's design tokens and the Claude Code desktop app because those are the references users will most often have nearby when they run a worker we built. If you find yourself fighting it, fight it — the goal is "looks good," not "exactly matches these hex codes."

## Framework choice (and how big the binary ends up)

The default framework for a GUI worker is **the OS-native one**. Native gives the smallest binary, the lightest run-time cost, and — because the theme below is calibrated to the platform's own look anyway — the cleanest match for the reference. Suggest the native option first, then offer cross-platform alternatives as fallbacks only when their toolchain is already on the host. Quote a rough installed size next to each option so the user can trade off explicitly:

| Framework                       | Roughly how big          | When to offer it                                                  |
|---------------------------------|--------------------------|-------------------------------------------------------------------|
| **Native (recommended, first)** | 5–15 MB                  | Always. SwiftUI on macOS, WinUI / WinAppSDK on Windows, GTK4 (or Qt against the system libs) on Linux. |
| **Electron + Tailwind CSS**     | 80–150 MB                | When `npm` is on the `PATH`. Heavy because it bundles Chromium, but the shortest path to a Tailwind-driven Claude-Code-style window if the user wants a true webview UI. |
| **Tauri**                       | 5–20 MB                  | When a Rust toolchain (`cargo`) is on the `PATH`. Uses the system webview, so the binary stays near-native-sized while still letting you style with Tailwind. |
| **PySide6 / PyQt**              | 40–80 MB                 | Python-only stacks where the user doesn't want to install Node or Rust. Heavier than Tauri but lighter than Electron. |
| **Tkinter**                     | 10–30 MB                 | Last-resort fallback when the user has nothing else and won't install a toolchain. Themable enough with `ttk` to clear the bar, but the chrome is the hardest to fix. |

Phrase the question to the user as "I'd build the UI as a native `<platform>` app (~X MB) — that gets us the smallest binary and the closest match for the look. Want that, or a cross-platform option?" and list the alternatives that the host's toolchains actually support. The pick lands in `<os>-specific.md` along with the size estimate the user agreed to.

The palette tokens below are written assuming a CSS variable home (Tailwind's `:root` for Electron / Tauri), but they translate directly to a SwiftUI `Color` set on macOS, a WinUI `ThemeDictionary` on Windows, a `QPalette` for PySide6, or a `ttk.Style` map for Tkinter. Whatever the framework, the tokens come from this file — don't redefine the colors in the worker's source.

## Palette

Claude-desktop adjacent: a near-white canvas, very soft borders, a single warm accent. Stick to these unless the user asked for a custom palette.

| Token            | Hex       | Use for                                                                 |
|------------------|-----------|-------------------------------------------------------------------------|
| `bg.base`        | `#FAFAF7` | Window background, the largest surface; the warm off-white you see in the Claude Code app. |
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

- **Native (the default — SwiftUI on macOS, WinUI on Windows, GTK4 / Qt on Linux)**: prefer the platform's title-bar-tint API rather than going frameless. SwiftUI: `.windowStyle(.hiddenTitleBar)` so SwiftUI content paints the whole window, plus the CALayer fix below (`.toolbarBackground(...)` and `.background(Color)` alone are *not* enough on macOS — see the SwiftUI subsection). WinUI: `AppWindow.TitleBar.BackgroundColor = ...` plus matching `ButtonBackgroundColor` and `InactiveBackgroundColor`. GTK4: set `gtk_header_bar_set_decoration_layout` and theme the header bar through CSS so it picks up `bg.base`.
- **Electron (only when npm is available)**: set `titleBarStyle: 'hiddenInset'` on macOS and `titleBarStyle: 'hidden'` with `titleBarOverlay` configured to use `bg.base` on Windows/Linux. Render the title text and any window controls inside the renderer process with Tailwind classes so the bar matches the body exactly. The macOS traffic-light buttons stay native; that's fine and expected. For Linux, render your own close/minimize/maximize controls or use a library like `custom-electron-titlebar`.
- **Tauri (only when a Rust toolchain is available)**: set `decorations: false` in `tauri.conf.json` and render the title bar in the webview using the same Tailwind classes you'd use in Electron. Wire up window-drag with `data-tauri-drag-region` on the bar.
- **PySide6 / PyQt**: set `Qt.FramelessWindowHint` and draw a custom title bar widget at the top of the central widget, styled with `bg.base`. Add window-drag handling on the custom bar so the window remains movable.
- **Tkinter**: by default, the window title bar is the OS chrome — never matching `bg.base`. Options: (a) call `root.overrideredirect(True)` and draw your own title bar as the first row in the window using `bg.base` for the background, with a label for the title and a close button. (b) on Windows 10+, use `pywinstyles` or set `DWMWA_CAPTION_COLOR` via `ctypes` so the native title bar follows the app's theme. (a) is the more reliable fix; (b) is less code if you only target Windows.

Whichever path you take, the title bar's background must be exactly `bg.base` (or one shade lighter/darker if you want a subtle separator) — *not* the OS default, *not* a slightly-different-shade that catches the eye.

### SwiftUI on macOS: the title-bar strip goes white when the window loses focus

This one bites every SwiftUI worker and the obvious fix doesn't hold, so it's worth doing right the first time. With `.hiddenTitleBar` and `.background(WindowChrome.bg)` the window looks correct while it's focused, then the top strip flashes white the moment another app takes focus. The cause: AppKit applies an *inactive* appearance to the window's content when focus is lost, and SwiftUI's `.background(Color)` is composed into that content layer, so AppKit re-tints it. `.toolbarBackground(...)` has the same problem. The clean native fix, `containerBackground(_:for:.window)`, only exists on macOS 15+, so a worker targeting macOS 13–14 can't use it.

The fix that works on macOS 13+ is to bake the color into the content view's `CALayer`. A layer's `backgroundColor` is a raw `CGColor` that AppKit's focus-state appearance does not touch, and it paints behind SwiftUI's whole view tree — so any region SwiftUI doesn't paint opaquely (including the title-bar strip under `.fullSizeContentView`, which `.hiddenTitleBar` implies) shows the same color whether the window is focused or not. Reach for the AppDelegate because SwiftUI builds the `NSWindow` asynchronously, so you wait a tick (and retry a few times) before grabbing it.

```swift
import SwiftUI
import AppKit

// Your bg.base color, as both Color (SwiftUI) and NSColor (AppKit).
enum WindowChrome {
    static let bg   = Color(red: 0.969, green: 0.961, blue: 0.949)
    static let bgNS = NSColor(srgbRed: 0.969, green: 0.961, blue: 0.949, alpha: 1.0)
}

@main
struct MyApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    var body: some Scene {
        Window("My App", id: "main") {
            ContentView()
                .background(WindowChrome.bg.ignoresSafeArea())   // SwiftUI body fallback
        }
        .windowStyle(.hiddenTitleBar)   // SwiftUI content paints the whole window
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in self?.applyWindowChrome() }   // window isn't ready on the first tick
    }

    private func applyWindowChrome(retry: Int = 0) {
        guard let win = NSApp.windows.first(where: { $0.identifier?.rawValue.contains("main") == true }) else {
            if retry < 20 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                    self?.applyWindowChrome(retry: retry + 1)
                }
            }
            return
        }
        win.backgroundColor = WindowChrome.bgNS                  // first-frame fallback, before SwiftUI paints
        if let content = win.contentView {
            content.wantsLayer = true
            content.layer?.backgroundColor = WindowChrome.bgNS.cgColor   // the actual focus-state fix
        }
    }
}
```

Each piece earns its place: `.hiddenTitleBar` lets SwiftUI own the whole window instead of AppKit drawing its own title-bar background; `.background(...)` covers the body region; `win.backgroundColor` paints the very first frame before SwiftUI's tree exists (otherwise it flashes default white on launch); and the `contentView.layer.backgroundColor` is the line that survives focus loss.

A few non-obvious traps that re-introduce the white strip — avoid all of them:

- Don't set `win.appearance = NSAppearance(named: .aqua)` — it forces a light-aqua material on the title bar that overrides your color.
- Don't combine `win.isOpaque = true` with `titlebarAppearsTransparent = true` — opaque mode composites the title bar against the system background instead of your color.
- Don't use SwiftUI `.alert(...)` for confirmations — on macOS it presents as a window-modal sheet whose lifecycle drops the transparent-title-bar settings when it dismisses, leaving the strip white afterward. Render confirmation dialogs as in-tree SwiftUI overlays instead.
- If you can require macOS 15+, `.containerBackground(WindowChrome.bg, for: .window)` replaces nearly all of the above in one line — use it only when dropping macOS 13–14 support is acceptable.

## Typography

- Sans-serif system stack. Don't ship a custom font unless the user asked for one. For native frameworks, this falls out of the platform automatically (SwiftUI / WinUI / GTK pick the right system face on their own); for Electron and Tauri, it's one line in Tailwind's config (`fontFamily.sans`); for the Python frameworks, set it once on the root style.
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

The rule of thumb is "more space than you think." Cramped UIs read as toy UIs. The Claude Code app errs on the side of generous spacing; the workers we build should too.

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

### Text from the outside world — decode it before it hits the screen

Any text a worker pulls from an RSS feed, an HTML page, a JSON API, or model output is liable to arrive HTML- or URL-encoded, and showing it raw is a quiet but glaring polish bug. A headline that reads `Dave&#039;s Q3 take: &quot;don&rsquo;t panic&quot; &amp; hold` in the worker's window should read `Dave's Q3 take: "don't panic" & hold` — the user sees the characters, never the codes. This is the same class of problem as the title-bar tell: the worker still *works*, but the raw `&#039;`, `&amp;`, `&nbsp;`, `&#8217;` litter makes it look broken and unfinished.

The fix is to decode entities once, at the boundary where outside text enters the worker, before it's stored or rendered — not to sprinkle replacements at each label. Whichever framework drew the UI:

- **Python workers (Tkinter, PySide6/PyQt, or any backend feeding a webview)**: run incoming strings through `html.unescape()` (stdlib — handles named entities like `&amp;`, decimal `&#039;`, and hex `&#x27;` alike). If the source is a URL-encoded field, `urllib.parse.unquote` first. Decode at ingest, in the CODE unit that fetches or parses the data, so everything downstream holds clean text.
- **Electron / Tauri (webview)**: set text via `element.textContent = value`, never `innerHTML = value`. Assigning to `textContent` shows exactly the characters in the string, so if the string still contains literal `&#039;` you must decode it first (e.g. a tiny helper that writes to a detached element's `innerHTML` and reads back `textContent`, or a library like `he.decode`). The trap is the inverse too: dropping already-decoded text into `innerHTML` re-interprets `<`, `&`, etc. as markup. Keep data in `textContent`.
- **Native (SwiftUI / WinUI / GTK)**: these render plain strings literally, so decode at ingest in the data layer (Swift: `NSAttributedString` with `.html`, or a small entity map for the common cases; the simplest reliable path is to decode in whatever fetch/parse code produces the string, same as the Python advice).

A good gut-check before shipping: feed the worker a sample item whose source text contains an apostrophe, a quote, an ampersand, and a non-breaking space, and confirm the window shows `' " &` and a normal space — not their encoded forms. Entity litter is exactly the kind of thing the author stops seeing after staring at it, but the recipient notices immediately.

## Applying it

How you actually wire this into a framework depends on what the user picked in the interview:

- **Native — SwiftUI on macOS (default)** — declare the palette as a `Color` extension keyed off the tokens below, then set `.background(Color.bgBase)` on the root view and `.windowStyle(.hiddenTitleBar)`. Crucially, also apply the CALayer title-bar fix from the "SwiftUI on macOS" subsection above — `.background` / `.toolbarBackground` alone leave the title-bar strip white when the window loses focus. Use `.cornerRadius(12)` on cards, `.cornerRadius(8)` on buttons / inputs, and `Capsule()` for pills. The platform font and HiDPI rendering come for free.
- **Native — WinUI / WinAppSDK on Windows (default)** — drop the palette into a `ThemeDictionary` (`Application.Resources["BgBase"]`, etc.) and reference the keys from XAML (`Background="{ThemeResource BgBase}"`). Set `AppWindow.TitleBar.BackgroundColor` and `ButtonBackgroundColor` to `bg.base`. Use `CornerRadius="12"` on `Border` / `Grid` cards, `8` on `Button` / `TextBox`.
- **Native — GTK4 / Qt on Linux (default)** — supply the palette as a CSS file loaded via `Gtk.CssProvider` (GTK4) or as a QSS stylesheet on the `QApplication` (Qt). Theme the header bar from the same CSS so it picks up `bg.base`.
- **Electron + Tailwind (only when npm is available)** — define the palette tokens as CSS custom properties in a single stylesheet (`src/theme.css`) and reference them from Tailwind's `theme.extend.colors` in `tailwind.config.js`. Then everything in the renderer uses Tailwind utilities (`bg-base`, `text-primary`, `rounded-lg`, etc.) that map back to the tokens. `titleBarStyle` set in the main process; custom title bar rendered in the renderer with the same classes as the rest of the body.
- **Tauri (only when a Rust toolchain is available)** — same CSS-variables-plus-Tailwind setup as Electron. `decorations: false` in `tauri.conf.json`.
- **PySide6 / PyQt** — write a QSS stylesheet using the palette tokens. Set it on the `QApplication` so it cascades. Use `Qt.FramelessWindowHint` plus a custom `QWidget` title bar.
- **Tkinter** — use `ttk.Style().configure(...)` for the widget styles, and set background colors directly on `tk.Frame` / `tk.Toplevel`. Drop the Tk default theme (`style.theme_use('clam')` first — `clam` is the most themeable of the built-ins). Custom title bar via `overrideredirect(True)` as described above.

Whichever framework, the palette tokens come from this file. Don't redefine the colors in the worker's source — paste this palette into the worker's `<os>/resources/theme.{css,json,py}` (whichever shape fits the framework) so a future reforge can find them in one place.

## When to deviate

The user owns the worker. If they say "I want it dark" or "make it blue not terracotta," do that. The default exists so the *uninstructed* case still looks good — it's not a religion. Record any deviation in `AUTHORING.md` so the next reforge doesn't quietly walk it back to defaults.
