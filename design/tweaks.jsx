/* ============================================================
   Tweaks — expressive, system-level controls that reshape the
   whole orchestrator's feel by overriding root CSS variables.
   Mounts its own React root so it never touches the app tree.
   ============================================================ */
(function () {
  "use strict";
  const { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio } = window;
  const { useEffect } = React;
  const e = React.createElement;

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "accent": "#e8853d",
    "atmosphere": "midnight",
    "density": "cozy"
  }/*EDITMODE-END*/;

  // ---- Accent presets: each recolors brand mark, primary buttons,
  //      active-nav glyphs, focus rings and selection in one move. ----
  const ACCENTS = [
    { hex: "#e8853d", L: 0.74, C: 0.155, H: 52 },   // Ember (default)
    { hex: "#3fa9d4", L: 0.74, C: 0.135, H: 210 },  // Cyan
    { hex: "#b07be8", L: 0.72, C: 0.16,  H: 300 },  // Violet
    { hex: "#4fd08a", L: 0.74, C: 0.13,  H: 160 },  // Emerald
  ];

  function applyAccent(hex) {
    const a = ACCENTS.find(x => x.hex === hex) || ACCENTS[0];
    const r = document.documentElement.style;
    const ch = (l, c, h) => `oklch(${l} ${c} ${h})`;
    r.setProperty("--accent", ch(a.L, a.C, a.H));
    r.setProperty("--accent-deep", ch(a.L - 0.08, a.C - 0.005, a.H - 2));
    r.setProperty("--accent-hover", ch(a.L + 0.05, a.C, a.H));
    r.setProperty("--accent-dim", `oklch(${a.L} ${a.C} ${a.H} / 0.14)`);
    r.setProperty("--accent-line", `oklch(${a.L} ${a.C} ${a.H} / 0.36)`);
    r.setProperty("--on-accent", ch(0.23, 0.05, a.H));
  }

  // ---- Atmosphere: reshapes every surface + hairline. Same lightness
  //      ladder, different hue + chroma → distinct material mood. ----
  const ATMOS = {
    midnight: { H: 264, bg: 0.010, ln: 0.012 },   // cool blue-black (default)
    carbon:   { H: 264, bg: 0.000, ln: 0.000 },   // neutral graphite
    slate:    { H: 255, bg: 0.024, ln: 0.028 },   // saturated deep blue
  };

  function applyAtmosphere(key) {
    const a = ATMOS[key] || ATMOS.midnight;
    const r = document.documentElement.style;
    const c = (mul) => +(a.bg * mul).toFixed(4);
    const cl = (mul) => +(a.ln * mul).toFixed(4);
    const set = (name, L, chroma) => r.setProperty(name, `oklch(${L} ${chroma} ${a.H})`);
    set("--bg-0", 0.165, c(0.8));
    set("--bg-1", 0.205, c(0.9));
    set("--bg-2", 0.235, c(1.0));
    set("--bg-3", 0.275, c(1.2));
    set("--bg-4", 0.315, c(1.3));
    set("--line",      0.305, cl(0.92));
    set("--line-soft", 0.255, cl(0.83));
    set("--line-hi",   0.40,  cl(1.17));
    // topbar uses a literal bg-0 with alpha for its blur — keep it in sync
    r.setProperty("--topbar-bg", `oklch(0.165 ${c(0.8)} ${a.H} / 0.7)`);
    // terminal/log surfaces sit below bg-0 — keep their hue/chroma in sync too
    r.setProperty("--term-bg",        `oklch(0.13 ${c(0.8)} ${a.H})`);
    r.setProperty("--term-row",       `oklch(0.16 ${c(0.9)} ${a.H})`);
    r.setProperty("--term-row-hover", `oklch(0.17 ${c(1.0)} ${a.H})`);
  }

  function applyTweaks(t) {
    applyAccent(t.accent);
    applyAtmosphere(t.atmosphere);
    document.documentElement.setAttribute("data-density", t.density);
  }

  function Tweaks() {
    const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
    useEffect(() => { applyTweaks(t); }, [t.accent, t.atmosphere, t.density]);

    return e(TweaksPanel, { title: "Tweaks" },
      e(TweakSection, { label: "Accent" }),
      e(TweakColor, {
        label: "Brand color",
        value: t.accent,
        options: ACCENTS.map(a => a.hex),
        onChange: (v) => setTweak("accent", v),
      }),
      e(TweakSection, { label: "Atmosphere" }),
      e(TweakRadio, {
        label: "Surface mood",
        value: t.atmosphere,
        options: [
          { value: "midnight", label: "Midnight" },
          { value: "carbon", label: "Carbon" },
          { value: "slate", label: "Slate" },
        ],
        onChange: (v) => setTweak("atmosphere", v),
      }),
      e(TweakSection, { label: "Density" }),
      e(TweakRadio, {
        label: "Spacing",
        value: t.density,
        options: [
          { value: "compact", label: "Compact" },
          { value: "cozy", label: "Cozy" },
          { value: "roomy", label: "Roomy" },
        ],
        onChange: (v) => setTweak("density", v),
      }));
  }

  // apply persisted defaults immediately so first paint matches saved state
  applyTweaks(TWEAK_DEFAULTS);

  const host = document.createElement("div");
  document.body.appendChild(host);
  ReactDOM.createRoot(host).render(e(Tweaks));
})();
