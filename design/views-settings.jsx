/* ============================================================
   Settings — General
   Exposes window.Views.SettingsView
   ============================================================ */
(function () {
  "use strict";
  const { e } = window.UI;
  const { useState, useMemo } = React;

  // Build the full IANA zone list (Intl.supportedValuesOf), each labeled with its
  // CURRENT offset, e.g. "America/Los Angeles \u00b7 UTC\u221207:00". UTC is prepended if
  // missing; the list is kept in canonical (alphabetical) order. Re-derived once per mount.
  function tzZoneOptions() {
    let zones;
    try { zones = Intl.supportedValuesOf("timeZone"); }
    catch (e) { zones = ["UTC", "America/Los_Angeles", "America/New_York", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"]; }
    if (zones.indexOf("UTC") === -1) zones = ["UTC"].concat(zones);
    const now = Date.now();
    const off = (z) => window.UI.tzOffsetMinutes(z, now);
    return zones.map(z => {
      const o = off(z);
      const sign = o < 0 ? "\u2212" : "+";
      const h = Math.floor(Math.abs(o) / 60), m = Math.abs(o) % 60;
      const tag = o === 0 ? "UTC" : `UTC${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      return { value: z, label: z === "UTC" ? "UTC" : `${z.replace(/_/g, " ")} \u00b7 ${tag}` };
    });
  }

  /* ---------- shared bits ---------- */
  function Card({ title, sub, action, children, flush }) {
    return e("div", { className: "card" },
      e("div", { className: "card-h" },
        e("h3", null, title),
        sub && e("span", { className: "sub" }, sub),
        action && e("span", { style: { marginLeft: "auto" } }, action)),
      flush ? children : e("div", { className: "card-b" }, children));
  }
  function Row({ title, desc, toggle, children }) {
    return e("div", { className: "set-row" },
      e("div", { className: "lbl" },
        e("div", { className: "t" }, title),
        desc && e("div", { className: "d" }, desc)),
      e("div", { className: "ctl" + (toggle ? " toggle-ctl" : "") }, children));
  }
  function Toggle({ on, onClick }) {
    return e("button", { className: "toggle" + (on ? " on" : ""), onClick, role: "switch", "aria-checked": on });
  }
  // Settings selects use the shared dropdown (window.UI.Select) so they match
  // the row "⋯" menu and every other dropdown. block = full row width.
  function Select(props) { return e(window.UI.Select, Object.assign({ block: true }, props)); }

  function SettingsView({ ctx }) {
    const [s, setS] = useState({
      dataDir: "/Users/forge/data",
      execSeparate: false,
      execPath: "/Users/forge/data",
      wsSeparate: false,
      wsPath: "/Users/forge/data",
      launchOnBoot: true,
      runInBackground: true,
    });
    function set(p) { setS(x => ({ ...x, ...p })); }

    return e("div", { className: "page page-wide fadein" },
      e("div", { className: "ph" },
        e("div", null,
          e("h1", null, "Settings"),
          e("p", null, "All changes are saved automatically."))),

      e("div", { className: "settings-col", style: { maxWidth: "none" } },
        e(DataDirectory, { s, set }),
        e(General, { s, set, ctx }),
        e(About, { ctx })));
  }

  /* ---------- DATA DIRECTORY ---------- */
  function DataDirectory({ s, set }) {
    // app config lives OUTSIDE the data directory — per-user OS config dir
    const configPath = "~/Library/Application Support/Worker Forge/config.json";
    // The shipped app disables the active "Change" buttons (label "Working…") while an
    // async folder pick / path set is in flight; the prototype simulates that briefly.
    const [busy, setBusy] = useState(false);
    function pickDir() {
      setBusy(true);
      setTimeout(() => setBusy(false), 600);
    }
    // When execution data is NOT stored separately, it lives in the data directory.
    const effectiveExecPath = s.execSeparate ? s.execPath : s.dataDir;
    const effectiveWsPath = s.wsSeparate ? s.wsPath : s.dataDir;
    function toggleExecSeparate() {
      // Turning the override on seeds the custom path from the current data directory
      // so the default is "same as workflows and tasks".
      set(s.execSeparate ? { execSeparate: false } : { execSeparate: true, execPath: s.dataDir });
    }
    function toggleWsSeparate() {
      set(s.wsSeparate ? { wsSeparate: false } : { wsSeparate: true, wsPath: s.dataDir });
    }
    return e(Card, { title: "Data Directory" },
      e("div", { className: "ws-row" },
        e("div", { className: "lbl" },
          e("div", { className: "d" }, "Workflows and tasks. Use a synced or version-controlled folder to share across machines.")),
        e("div", { className: "ws-field" },
          e(window.UI.Icon, { name: "folderOpen", size: 15 }),
          e("span", { className: "ws-path", title: s.dataDir }, s.dataDir || "—"),
          e(window.UI.Btn, { variant: "ghost", size: "sm", icon: "folder", onClick: pickDir, disabled: busy }, busy ? "Working…" : "Change"))),
      e("div", { className: "ws-row" },
        e("div", { className: "ws-row-h" },
          e("div", { className: "lbl" },
            e("div", { className: "d" }, "Workflow exections; outputs and step logs.")),
          e("div", { className: "ws-row-toggle" },
            e("span", { className: "ws-toggle-lbl" }, "Separate location"),
            e(Toggle, { on: s.execSeparate, onClick: toggleExecSeparate }))),
        s.execSeparate
          ? e("div", { className: "ws-field" },
              e(window.UI.Icon, { name: "folderOpen", size: 15 }),
              e("span", { className: "ws-path", title: s.execPath }, s.execPath || "—"),
              e(window.UI.Btn, { variant: "ghost", size: "sm", icon: "folder", onClick: pickDir, disabled: busy }, busy ? "Working…" : "Change"))
          : e("div", { className: "ws-field ws-field-muted" },
              e(window.UI.Icon, { name: "folderOpen", size: 15 }),
              e("span", { className: "ws-path", title: effectiveExecPath }, effectiveExecPath || "—"),
              e(window.UI.Btn, { variant: "ghost", size: "sm", icon: "folder", disabled: true }, "Change"))),
      e("div", { className: "ws-row" },
        e("div", { className: "ws-row-h" },
          e("div", { className: "lbl" },
            e("div", { className: "d" }, "Workspace directories.")),
          e("div", { className: "ws-row-toggle" },
            e("span", { className: "ws-toggle-lbl" }, "Separate location"),
            e(Toggle, { on: s.wsSeparate, onClick: toggleWsSeparate }))),
        s.wsSeparate
          ? e("div", { className: "ws-field" },
              e(window.UI.Icon, { name: "folderOpen", size: 15 }),
              e("span", { className: "ws-path", title: s.wsPath }, s.wsPath || "—"),
              e(window.UI.Btn, { variant: "ghost", size: "sm", icon: "folder", onClick: pickDir, disabled: busy }, busy ? "Working…" : "Change"))
          : e("div", { className: "ws-field ws-field-muted" },
              e(window.UI.Icon, { name: "folderOpen", size: 15 }),
              e("span", { className: "ws-path", title: effectiveWsPath }, effectiveWsPath || "—"),
              e(window.UI.Btn, { variant: "ghost", size: "sm", icon: "folder", disabled: true }, "Change"))),
      e("div", { className: "ws-row" },
        e("div", { className: "cfg-note" },
          e(window.UI.Icon, { name: "info", size: 14 }),
          e("div", { className: "cn-m" },
            e("div", { className: "cn-t" }, "App settings are stored separately and not inside the data directory:"),
            e("div", { className: "cn-p", title: configPath }, configPath || "the per-user config directory")))));
  }

  /* ---------- GENERAL ---------- */
  function General({ s, set, ctx }) {
    const tzOptions = useMemo(tzZoneOptions, []);
    return e(React.Fragment, null,
      e(Card, { title: "General" },
        e(Row, { title: "Time zone", desc: "Schedules and timestamps are displayed in this zone." },
          e(Select, { value: ctx.timezone, onChange: v => ctx.setTimezone(v), options: tzOptions, search: true, searchPlaceholder: "Search time zone…" })),
        e(Row, { title: "Launch on startup", desc: "Open Worker Forge automatically when this computer boots.", toggle: true },
          e(Toggle, { on: s.launchOnBoot, onClick: () => set({ launchOnBoot: !s.launchOnBoot }) })),
        e(Row, { title: "Keep running in background", desc: "Keep running scheduled workflows after the window closes.", toggle: true },
          e(Toggle, { on: s.runInBackground, onClick: () => set({ runInBackground: !s.runInBackground }) }))));
  }

  /* ---------- ABOUT ---------- */
  function About({ ctx }) {
    const { Icon } = window.UI;
    const links = [
      { label: "View on GitHub", icon: "github", href: "https://github.com/hansololz/worker-forge" },
    ];
    return e(Card, { title: "About" },
      // links
      e("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 14 } },
        links.map(l => e("a", { key: l.label, href: l.href, target: "_blank", rel: "noreferrer",
          style: { display: "inline-flex", alignItems: "center", gap: 7, height: 30, padding: "0 12px",
            border: "1px solid var(--line-soft)", borderRadius: 8, background: "var(--bg-2)",
            fontSize: 12.5, fontWeight: 500, color: "var(--tx-mid)", textDecoration: "none" } },
          e(Icon, { name: l.icon, size: 13, style: { color: "var(--tx-lo)" } }), l.label))),

      // footer
      e("div", { style: { marginTop: 16, paddingTop: 14, paddingBottom: 14, borderTop: "1px solid var(--line-soft)",
        fontSize: 11.5, color: "var(--tx-dim)", lineHeight: 1.7 } },
        e("div", null, "\u00a9 2026 Worker Forge. All rights reserved.")));
  }

  window.Views = window.Views || {};
  Object.assign(window.Views, { SettingsView });
})();
