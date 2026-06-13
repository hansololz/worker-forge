/* ============================================================
   Tasks library + Task editor (bash/python step editor)
   Exposes window.Views.TasksLibrary + window.TaskEditor
   ============================================================ */
(function () {
  "use strict";
  const { e, Icon, Btn, Select, highlightCode } = window.UI;
  const stepLang = (sc) => sc.lang || (/\.py$/i.test(sc.name || "") ? "python" : "bash");
  const { useState, useEffect, useRef, useLayoutEffect } = React;
  const DB = window.DB;

  const CAT_LABEL = { source: "Source", build: "Build", quality: "Quality", deploy: "Deploy", ops: "Operations", data: "Data" };
  const CAT_ORDER = ["ops", "data", "source", "build", "quality", "deploy"];

  // env-var key must be a valid shell identifier
  const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  function envRowError(row, i, env) {
    const k = (row.k || "").trim();
    if (k === "") {
      // a blank key only matters once the row carries a value or is marked required
      return ((row.v || "").trim() !== "" || row.required) ? "Key required" : null;
    }
    if (!ENV_KEY_RE.test(k)) return "Letters, digits, underscore — can't start with a digit";
    if (env.some((r, j) => j !== i && (r.k || "").trim() === k)) return "Duplicate key";
    return null;
  }
  // positive whole number (used for task timeout)
  function isPosInt(v) { return v !== "" && v != null && Number.isInteger(Number(v)) && Number(v) >= 1; }
  // strip a trailing .sh/.py extension to get the editable stem
  function stepStem(name) { return (name || "").replace(/\.(sh|py)$/i, ""); }
  // keep only valid script-name characters; the user types a stem, the extension is fixed
  function cleanScriptStem(v) { return (v || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, ""); }

  /* ---------------- TASKS LIBRARY ---------------- */
  function TasksLibrary({ ctx }) {
    const [q, setQ] = useState("");
    const tasks = ctx.tasks.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.category.includes(q.toLowerCase()));
    const byCat = {};
    tasks.forEach(s => { (byCat[s.category] = byCat[s.category] || []).push(s); });

    return e("div", { className: "page page-wide fadein" },
      e("div", { className: "ph" },
        e("div", null,
          e("h1", null, "Tasks"),
          e("p", null, "Reusable units of work. Each task runs one or more bash steps and can be dropped into any workflow.")),
        e("div", { className: "ph-actions" },
          e(Btn, { variant: "primary", icon: "plus", onClick: () => ctx.openTask("__new") }, "New task"))),

      e("div", { className: "toolbar" },
        e("div", { className: "topbar-spacer" }),
        e("div", { className: "searchbox", style: { width: 220 } },
          e(Icon, { name: "search", size: 15 }),
          e("input", { placeholder: "Search tasks…", value: q, onChange: ev => setQ(ev.target.value) }))),

      CAT_ORDER.filter(c => byCat[c]).map(cat =>
        e("div", { key: cat },
          e("div", { className: "section-title", style: { display: "flex", alignItems: "center", gap: 8 } },
            CAT_LABEL[cat], e("span", { style: { color: "var(--tx-dim)", fontWeight: 400 } }, byCat[cat].length)),
          e("div", { className: "grid-cards" },
            byCat[cat].map(s => e(TaskCard, { key: s.id, s, ctx }))))));
  }

  function TaskCard({ s, ctx }) {
    return e("div", { className: "task-card", onClick: () => ctx.openTask(s.id) },
      e("div", { className: "sc-top" },
        e("div", { className: "sc-ic" }, e(Icon, { name: s.icon, size: 17 })),
        e("div", { style: { minWidth: 0 } },
          e("h4", null, s.name)),
        e("button", { className: "btn icon sm btn-ghost", style: { marginLeft: "auto" }, onClick: (ev) => { ev.stopPropagation(); ctx.toast("Clone task"); } }, e(Icon, { name: "copy", size: 14 }))),
      e("p", null, s.desc),
      e("div", { className: "sc-foot" },
        e("span", { className: "tag" }, s.steps.length + (s.steps.length === 1 ? " step" : " steps")),
        e("span", { className: "tag" }, s.timeout == null ? "no timeout" : "timeout " + (s.timeout >= 60 ? Math.round(s.timeout / 60) + "m" : s.timeout + "s")),
        e("span", { className: "tag" }, "used by " + s.usedBy)));
  }

  /* ---------------- TASK DETAIL (read-only) ---------------- */
  // Mirrors WorkflowDetail: a view-first page with a version picker and an Edit
  // button into TaskEditor, so tasks behave like every other object in the app.
  function fmtTimeout(t) {
    if (t == null) return "no timeout";
    return "timeout " + (t >= 60 ? Math.round(t / 60) + "m" : t + "s");
  }

  function StepView({ sc }) {
    const lang = stepLang(sc);
    const [open, setOpen] = useState(false);
    const lines = sc.code.split("\n");
    return e("div", { className: "code-ed", style: { marginBottom: 2 } },
      e("div", { className: "code-ed-h", style: { cursor: "pointer" }, onClick: () => setOpen(o => !o) },
        e(Icon, { name: open ? "chevD" : "chevR", size: 14, style: { color: "var(--tx-lo)" } }),
        e("div", { className: "fn", style: { flex: 1, display: "flex", alignItems: "center", minWidth: 0, gap: 8 } },
          e("span", { className: "mono", style: { fontSize: 12, color: "var(--tx-hi)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: "none" } }, sc.name),
          sc.desc ? e("span", { style: { fontSize: 11.5, color: "var(--tx-lo)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, sc.desc) : null),
        e("span", { className: "sh", style: { flex: "none" } }, lang === "python" ? "python" : "bash")),
      open && e("div", { className: "code-area" },
        e("div", { className: "gutter" }, lines.map((_, i) => e("span", { key: i }, i + 1))),
        e("div", { className: "code-input-wrap", style: { overflow: "auto" } },
          e("div", { className: "code-hl", style: { position: "static", pointerEvents: "auto" } }, highlightCode(sc.code, lang)))));
  }

  function TaskDetail({ ctx }) {
    const live = ctx.tasks.find(x => x.id === ctx.state.taskId) || DB.taskById[ctx.state.taskId];
    const versions = live ? buildVersions(live) : [];
    const curVer = (live && live.version) || 1;
    const [selVer, setSelVer] = useState(curVer);
    useEffect(() => { setSelVer(curVer); }, [ctx.state.taskId, curVer]);
    if (!live) return e("div", { className: "page fadein" }, e("div", { className: "empty", style: { padding: "60px 0" } }, "Task not found."));

    const selEntry = versions.find(v => v.version === selVer) || versions[0];
    const viewingOld = !!selEntry && selVer !== curVer;
    const s = selEntry ? selEntry.data : live;            // task as it looked at the selected version
    const selSavedAt = selEntry && selEntry.savedAt;
    const env = s.env || [];
    const steps = s.steps || [];
    const usedByWfs = ctx.workflows.filter(w => w.stages.flat().includes(live.id));

    function restoreVersion() { ctx.saveTask({ ...s, id: live.id }); }

    return e("div", { className: "page fadein" },
      // header — matches the task editor's header shell (icon tile + name + version)
      e("div", { className: "ph", style: { alignItems: "center" } },
        e("div", { style: { minWidth: 0, flex: 1 } },
          e("div", { style: { display: "flex", alignItems: "center", gap: 11, minWidth: 0 } },
            e("div", { style: { fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--tx-hi)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, s.name),
            versions.length > 0 && e(Select, { mono: true, ariaLabel: "Task version", minWidth: 116, style: { flex: "none" }, btnStyle: { height: 30, padding: "0 30px 0 11px", fontSize: 12.5, borderRadius: 8 }, value: selVer, onChange: v => setSelVer(Number(v)), options: versions.map(v => ({ value: v.version, label: "v" + v.version + (v.current ? " \u00b7 current" : " \u00b7 " + (v.savedAt || "")) })) })),
          s.desc ? e("div", { style: { fontSize: 13.5, color: "var(--tx-lo)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, s.desc) : null),
        e("div", { className: "ph-actions" },
          e(Btn, { icon: "copy", onClick: () => ctx.toast("Cloned " + live.name) }, "Clone"),
          e(Btn, { variant: "primary", icon: "edit", onClick: () => ctx.editTask(live.id) }, "Edit"))),

      viewingOld && e("div", { className: "ver-banner" },
        e(Icon, { name: "clock", size: 14 }),
        e("span", null, "Viewing ", e("b", null, "v" + selVer), selSavedAt ? " (saved " + selSavedAt + ")" : "", " \u2014 an older version. Restoring brings it back as v" + (curVer + 1) + "."),
        e("div", { style: { marginLeft: "auto", display: "flex", gap: 8, flex: "none" } },
          e("button", { className: "btn sm btn-ghost", onClick: () => setSelVer(curVer) }, "Back to current"),
          e(Btn, { size: "sm", variant: "primary", icon: "sync", onClick: restoreVersion }, "Restore as v" + (curVer + 1)))),

      // meta strip — icon tile on the left of the category / details line
      e("div", { style: { display: "flex", alignItems: "center", gap: 13, margin: "4px 0 16px" } },
        e("div", { style: { width: 42, height: 42, borderRadius: 11, background: "var(--bg-2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", color: "var(--accent)", flex: "none" } }, e(Icon, { name: s.icon, size: 21 })),
        e("div", { className: "section-title", style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: 0 } },
          e("span", null, CAT_LABEL[s.category] || s.category),
          e("span", { style: { color: "var(--tx-dim)" } }, "\u00b7"),
          e("span", null, steps.length + (steps.length === 1 ? " step" : " steps")),
          e("span", { style: { color: "var(--tx-dim)" } }, "\u00b7"),
          e("span", null, fmtTimeout(s.timeout)),
          e("span", { style: { color: "var(--tx-dim)" } }, "\u00b7"),
          e("span", null, "used by " + usedByWfs.length + (usedByWfs.length === 1 ? " workflow" : " workflows")))),

      // steps
      e("div", { className: "card", style: { marginBottom: 16 } },
        e("div", { className: "card-h" },
          e(Icon, { name: "terminal", size: 15, style: { color: "var(--tx-lo)", flex: "none" } }),
          e("h3", null, "Steps"),
          e("span", { className: "sub", style: { marginLeft: "auto" } }, "run top-to-bottom")),
        e("div", { className: "card-b" },
          steps.length === 0
            ? e("div", { className: "empty", style: { padding: "10px 0" } }, "No steps \u2014 this task runs nothing.")
            : e("div", { className: "step-list" }, steps.map((sc, i) => e(StepView, { key: i, sc }))))),

      // parameters
      e("div", { className: "card", style: { marginBottom: 16 } },
        e("div", { className: "card-h" },
          e(Icon, { name: "settings", size: 15, style: { color: "var(--tx-lo)", flex: "none" } }),
          e("h3", null, "Parameters"),
          e("span", { className: "sub", style: { marginLeft: "auto" } }, env.length + (env.length === 1 ? " variable" : " variables"))),
        e("div", { className: "card-b", style: { padding: env.length ? 0 : 18 } },
          env.length === 0
            ? e("div", { className: "empty", style: { padding: "10px 0" } }, "No environment variables.")
            : env.map((p, i) => e("div", { key: p.k + i, className: "prep-row" },
                e("div", { className: "prep-k" },
                  e("span", { className: "param-key" }, p.k),
                  e("span", { className: "param-req" + (p.required ? " on" : "") }, p.required ? "required" : "optional")),
                e("div", { className: "prep-v", style: { justifyContent: "flex-end" } },
                  e("span", { className: "mono", style: { fontSize: 12.5, textAlign: "right", color: (p.v != null && p.v !== "") ? "var(--tx)" : "var(--tx-dim)" } }, (p.v != null && p.v !== "") ? p.v : "no default")))))),

      // used by
      e("div", { className: "card" },
        e("div", { className: "card-h" },
          e(Icon, { name: "workflows", size: 15, style: { color: "var(--tx-lo)", flex: "none" } }),
          e("h3", null, "Used by"),
          e("span", { className: "sub", style: { marginLeft: "auto" } }, usedByWfs.length + (usedByWfs.length === 1 ? " workflow" : " workflows"))),
        e("div", { className: "card-b" },
          usedByWfs.length === 0
            ? e("div", { className: "empty", style: { padding: "10px 0" } }, "Not used in any workflow yet.")
            : e("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
                usedByWfs.map(w => e("div", { key: w.id, className: "step-item", style: { cursor: "pointer" }, onClick: () => ctx.nav({ view: "workflow", workflowId: w.id }) },
                  e("div", { className: "si-ic" }, e(Icon, { name: "workflows", size: 15 })),
                  e("div", { className: "si-m" },
                    e("div", { className: "n" }, w.name),
                    e("div", { className: "d" }, w.stages.flat().length + " tasks")),
                  e(Icon, { name: "chevR", size: 15, style: { color: "var(--tx-lo)", marginLeft: "auto" } })))))));
  }

  /* ---------------- TASK EDITOR ---------------- */
  function TaskEditor({ ctx }) {
    const taskId = ctx.state.taskId;
    const isNew = taskId === "__new";
    const base = isNew
      ? { id: "__new", name: "", icon: "box", category: "ops", desc: "", timeout: 300, retries: 0, usedBy: 0, env: [], steps: [{ name: "bash-script.sh", desc: "Main step", code: "#!/usr/bin/env bash\nset -euo pipefail\n\n# write your script here\necho \"Hello\"" }] }
      : DB.taskById[taskId];
    // initial tab: Settings (not remembered across navigation)
    const [tab, setTab] = useState("settings");
    const versions = isNew ? [] : buildVersions(base);
    const curVer = isNew ? 0 : base.version;
    // Local draft state only — nothing is persisted across navigation. Leaving the
    // editor and returning loads fresh from saved data (no unsaved-draft cache).
    // Mirrors the app's useEditorDraft hook.
    const [openStep, setOpenStep] = useState(0);
    const [selVer, setSelVer] = useState(curVer);
    const [draft, setDraft] = useState(() => copyVer(base));
    const prevTask = useRef(taskId);
    const prevSel = useRef(selVer);
    // Switch to a *different* task within the editor. Reload fresh from saved data;
    // guarded so it never fires on the initial mount.
    useEffect(() => {
      if (taskId === prevTask.current) return;
      prevTask.current = taskId;
      setSelVer(curVer); setDraft(copyVer(base)); prevSel.current = curVer;
      setTab("settings");
      setOpenStep(0);
    }, [taskId]);
    // Load a different version into the draft when the user picks one from the
    // version dropdown. Guarded so it never fires on mount.
    useEffect(() => {
      if (selVer === prevSel.current) return;
      prevSel.current = selVer;
      const v = isNew ? null : (versions.find(x => x.version === selVer) || versions[0]);
      setDraft(copyVer(v ? v.data : base));
      setOpenStep(0);
    }, [selVer]);
    const viewingOld = !isNew && selVer !== curVer;
    const selSavedAt = (versions.find(v => v.version === selVer) || {}).savedAt;

    function patch(p) { setDraft(d => ({ ...d, ...p })); }
    function patchStep(i, p) { setDraft(d => ({ ...d, steps: d.steps.map((s, j) => j === i ? { ...s, ...p } : s) })); }
    function addStep(lang) {
      const tmpl = lang === "python"
        ? { ext: ".py", code: "#!/usr/bin/env python3\nimport sys\n\n\ndef main() -> int:\n    # write your script here\n    print(\"Hello\")\n    return 0\n\n\nif __name__ == \"__main__\":\n    sys.exit(main())" }
        : { ext: ".sh", code: "#!/usr/bin/env bash\nset -euo pipefail\n\n# write your script here\necho \"Hello\"" };
      const baseName = lang === "python" ? "python_script" : "bash-script";
      const sep = lang === "python" ? "_" : "-";
      setDraft(d => {
        // highest trailing number across all existing step names, +1
        const maxN = d.steps.reduce((m, s) => {
          const stem = (s.name || "").replace(/\.(sh|py)$/i, "");
          const hit = stem.match(/(\d+)$/);
          return hit ? Math.max(m, Number(hit[1])) : m;
        }, 0);
        const name = `${baseName}${sep}${maxN + 1}${tmpl.ext}`;
        return { ...d, steps: [...d.steps, { name, desc: "New step", lang: lang || "bash", code: tmpl.code }] };
      });
      setOpenStep(draft.steps.length);
    }
    function switchStepLang(i, newLang) {
      setDraft(d => ({ ...d, steps: d.steps.map((s, j) => {
        if (j !== i) return s;
        const name = /\.(sh|py)$/i.test(s.name) ? s.name.replace(/\.(sh|py)$/i, newLang === "python" ? ".py" : ".sh") : s.name;
        const lines = s.code.split("\n");
        if (/^#!/.test(lines[0])) lines[0] = newLang === "python" ? "#!/usr/bin/env python3" : "#!/usr/bin/env bash";
        return { ...s, lang: newLang, name, code: lines.join("\n") };
      }) }));
    }
    function removeStep(i) { setDraft(d => ({ ...d, steps: d.steps.filter((_, j) => j !== i) })); setOpenStep(0); }

    // reorder steps via up/down chevrons (matches the workflow steps editor)
    function moveStep(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= draft.steps.length) return;
      setDraft(d => { const arr = d.steps.slice(); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; return { ...d, steps: arr }; });
      setOpenStep(os => os === i ? j : os === j ? i : os);
    }

    const usedByWfs = ctx.workflows.filter(w => w.stages.flat().includes(taskId));

    // ---- validation ----
    const nameErr = !(draft.name || "").trim();
    const timeoutErr = draft.timeout != null && !isPosInt(draft.timeout);
    const envErrors = (draft.env || []).map((r, i) => envRowError(r, i, draft.env));
    const hasErr = nameErr || timeoutErr || envErrors.some(Boolean);

    return e("div", { className: "page fadein" },
      e("div", { className: "ph", style: { alignItems: "center" } },
        e("div", { style: { minWidth: 0, flex: 1 } },
          e("div", { style: { display: "flex", alignItems: "center", gap: 11, minWidth: 0 } },
            e("div", { style: { fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: draft.name ? "var(--tx-hi)" : "var(--tx-lo)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, draft.name || "New task"),
            !isNew && e(Select, { mono: true, ariaLabel: "Task version", minWidth: 116, style: { flex: "none" }, btnStyle: { height: 30, padding: "0 30px 0 11px", fontSize: 12.5, borderRadius: 8 }, value: selVer, onChange: v => setSelVer(Number(v)), options: versions.map(v => ({ value: v.version, label: "v" + v.version + (v.current ? " · current" : " · " + (v.savedAt || "")) })) })),
          draft.desc && e("div", { style: { fontSize: 13.5, color: "var(--tx-lo)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, draft.desc)),
        e("div", { className: "ph-actions" },
          e(Btn, { variant: "ghost", onClick: () => ctx.closeTask() }, "Cancel"),
          e(Btn, { variant: "primary", icon: viewingOld ? "sync" : "check", disabled: hasErr, onClick: () => ctx.saveTask(draft) }, isNew ? "Create task" : viewingOld ? "Restore as v" + (curVer + 1) : "Save changes"))),

      nameErr && e("div", { className: "field-err", style: { margin: "-8px 0 14px" } },
        e(Icon, { name: "alert", size: 13 }), "Task name is required."),

      viewingOld && e("div", { className: "ver-banner" },
        e(Icon, { name: "clock", size: 14 }),
        e("span", null, "Viewing ", e("b", null, "v" + selVer), selSavedAt ? " (saved " + selSavedAt + ")" : "", " — an older version. Saving restores it as v" + (curVer + 1) + "."),
        e("button", { className: "btn sm btn-ghost", style: { marginLeft: "auto", flex: "none" }, onClick: () => setSelVer(curVer) }, "Back to current")),

      e("div", { className: "tabs", style: { paddingLeft: 0, paddingRight: 0 } },
        [["settings", "Config"], ["steps", "Steps"]].map(([id, lbl]) =>
          e("button", { key: id, className: tab === id ? "on" : "", onClick: () => setTab(id) }, lbl,
            id === "steps" ? e("span", { style: { color: "var(--tx-dim)", marginLeft: 6 } }, draft.steps.length) : null))),

      e("div", { style: { paddingTop: 18 } },
        tab === "steps" && e("div", null,          e("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 } },
            e("div", { style: { fontSize: 12.5, color: "var(--tx-lo)" } }, "Steps run top-to-bottom. A non-zero exit fails the task."),
            e("div", { style: { display: "flex", gap: 6 } },
              e(Btn, { size: "sm", icon: "plus", variant: "ghost", onClick: () => addStep("bash") }, "Bash"),
              e(Btn, { size: "sm", icon: "plus", variant: "ghost", onClick: () => addStep("python") }, "Python"))),
          e("div", { className: "step-list" },
            draft.steps.map((sc, i) =>
              e(StepBlock, { key: i, sc, ctx, open: openStep === i, onToggle: () => setOpenStep(openStep === i ? -1 : i),
                onChange: p => patchStep(i, p), onSwitchLang: nl => switchStepLang(i, nl), onRemove: draft.steps.length > 1 ? () => removeStep(i) : null,
                isFirst: i === 0, isLast: i === draft.steps.length - 1, onMove: dir => moveStep(i, dir) })),
            draft.steps.length === 0 && e("div", { className: "empty", style: { padding: "26px 0" } },
              "No steps — this task runs nothing (no-op). Add a step to give it work to do.")),
          e("div", { className: "section-title", style: { marginTop: 30, display: "flex", alignItems: "center", gap: 8 } },
            "Parameters", e("span", { style: { color: "var(--tx-dim)", fontWeight: 400 } }, draft.env.length)),
          e(EnvTab, { draft, setDraft, errors: envErrors })),

        tab === "settings" && e(SettingsTab, { draft, patch, nameErr, timeoutErr, ctx, taskId, isNew, usedBy: usedByWfs.length })));
  }

  function StepBlock({ sc, open, onToggle, onChange, onSwitchLang, onRemove, isFirst, isLast, onMove, ctx }) {
    const lang = stepLang(sc);
    const ext = lang === "python" ? ".py" : ".sh";
    const stem = stepStem(sc.name);
    const lines = sc.code.split("\n");
    const [editing, setEditing] = useState(false);
    const [nameDraft, setNameDraft] = useState(stem);
    const nameRef = useRef(null);
    const draftClean = cleanScriptStem(nameDraft);
    const draftErr = !draftClean.trim();
    function startRename(ev) { ev.stopPropagation(); setNameDraft(stem); setEditing(true); }
    function commitRename() { if (draftErr) return; onChange({ name: draftClean + ext }); setEditing(false); }
    function cancelRename() { setEditing(false); }
    useEffect(() => { if (editing && nameRef.current) { nameRef.current.focus(); nameRef.current.select(); } }, [editing]);
    const taRef = useRef(null);
    const hlRef = useRef(null);
    useLayoutEffect(() => {
      const ta = taRef.current;
      if (open && ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }
    }, [sc.code, open]);
    function syncScroll() {
      const ta = taRef.current, hl = hlRef.current;
      if (ta && hl) { hl.scrollLeft = ta.scrollLeft; hl.scrollTop = ta.scrollTop; }
    }
    function onKeyDown(ev) {
      if (ev.key === "Tab") {
        ev.preventDefault();
        const ta = ev.target, s = ta.selectionStart, en = ta.selectionEnd;
        onChange({ code: sc.code.slice(0, s) + "  " + sc.code.slice(en) });
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
      }
    }
    const confirmRemove = (ev) => {
      ev.stopPropagation();
      if (!onRemove) return;
      ctx.confirm({
        icon: "trash", title: "Delete step",
        message: e(React.Fragment, null, "Delete ", e("b", null, sc.name), "?"),
        confirmLabel: "Delete step", onConfirm: onRemove,
      });
    };
    return e(React.Fragment, null,
     e("div", { className: "code-ed", style: { marginBottom: 2 } },
      e("div", { className: "code-ed-h", style: { cursor: "pointer" }, onClick: onToggle },
        e(Icon, { name: open ? "chevD" : "chevR", size: 14, style: { color: "var(--tx-lo)" } }),
        (() => {
          const stemErr = !stem.trim();
          if (editing) {
            return e("div", { className: "fn", style: { flex: 1, display: "flex", alignItems: "center", minWidth: 0 }, onClick: ev => ev.stopPropagation() },
              e("input", { ref: nameRef, className: "mono", spellCheck: false, "aria-invalid": draftErr, style: { background: "var(--bg-0)", border: "1px solid " + (draftErr ? "var(--accent-line)" : "var(--line)"), borderRadius: 6, padding: "2px 6px", color: "var(--tx-hi)", fontSize: 12, width: "calc(" + Math.max((draftClean.length || 1), 6) + "ch + 14px)", outline: "none", flex: "none" }, value: nameDraft,
                onChange: ev => setNameDraft(ev.target.value),
                onKeyDown: ev => { if (ev.key === "Enter") { ev.preventDefault(); commitRename(); } else if (ev.key === "Escape") { ev.preventDefault(); cancelRename(); } } }),
              e("span", { className: "mono", style: { fontSize: 12, color: "var(--tx-dim)", userSelect: "none", flex: "none" } }, ext),
              e("button", { className: "btn icon sm btn-ghost", title: draftErr ? "Enter a valid name" : "Save name", disabled: draftErr, style: { marginLeft: 6 }, onClick: ev => { ev.stopPropagation(); commitRename(); } }, e(Icon, { name: "check", size: 13 })),
              e("button", { className: "btn icon sm btn-ghost", title: "Cancel", onClick: ev => { ev.stopPropagation(); cancelRename(); } }, e(Icon, { name: "x", size: 13 })));
          }
          return e("div", { className: "fn", style: { flex: 1, display: "flex", alignItems: "center", minWidth: 0, gap: 6 } },
            e("span", { className: "mono", style: { fontSize: 12, color: stemErr ? "var(--accent)" : "var(--tx-hi)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
              stem || "(unnamed)", e("span", { style: { color: "var(--tx-dim)" } }, ext)),
            e("button", { className: "btn icon sm btn-ghost", title: "Rename step", style: { flex: "none" }, onClick: startRename }, e(Icon, { name: "edit", size: 12 })));
        })(),
        e("button", { className: "sh", title: "Switch language", style: { cursor: "pointer", background: "transparent" }, onClick: ev => { ev.stopPropagation(); onSwitchLang && onSwitchLang(lang === "python" ? "bash" : "python"); } }, lang === "python" ? "python" : "bash"),
        e("button", { className: "btn icon sm btn-ghost", disabled: isFirst, title: "Move step up", onClick: ev => { ev.stopPropagation(); onMove && onMove(-1); } }, e(Icon, { name: "chevD", size: 13, style: { transform: "rotate(180deg)" } })),
        e("button", { className: "btn icon sm btn-ghost", disabled: isLast, title: "Move step down", onClick: ev => { ev.stopPropagation(); onMove && onMove(1); } }, e(Icon, { name: "chevD", size: 13 })),
        e("button", { className: "btn icon sm btn-ghost", title: onRemove ? "Delete step" : "A task needs at least one step", disabled: !onRemove, onClick: confirmRemove }, e(Icon, { name: "trash", size: 13 }))),
      open && e("div", { className: "code-area" },
        e("div", { className: "gutter" }, lines.map((_, i) => e("span", { key: i }, i + 1))),
        e("div", { className: "code-input-wrap" },
          e("div", { className: "code-hl", ref: hlRef, "aria-hidden": true }, highlightCode(sc.code, lang)),
          e("textarea", { ref: taRef, className: "code-input", value: sc.code, spellCheck: false, onChange: ev => onChange({ code: ev.target.value }), onScroll: syncScroll, onKeyDown })))));
  }

  function SettingsTab({ draft, patch, nameErr, timeoutErr, ctx, taskId, isNew, usedBy = 0 }) {
    const icons = ["box", "git", "package", "flask", "shield", "rocket", "db", "bell", "sync", "check", "terminal", "bolt", "ai", "brain", "agent", "android", "cloud", "code"];
    return e("div", { style: { paddingTop: 2 } },
      e("div", { className: "field" },
        e("label", null, "Name"),
        e("input", { className: "input mono" + (nameErr ? " invalid" : ""), value: draft.name, "aria-invalid": !!nameErr, onChange: ev => patch({ name: ev.target.value }), placeholder: "Task name" })),
      e("div", { className: "field" },
        e("label", null, "Description"),
        e("textarea", { className: "textarea", rows: 2, value: draft.desc, onChange: ev => patch({ desc: ev.target.value }), placeholder: "What does this task do?" })),
      e("div", { className: "field" },
        e("label", null, "Icon"),
        e("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
          icons.map(ic => e("button", { key: ic, className: "node-ic", style: { width: 34, height: 34, cursor: "pointer", borderColor: draft.icon === ic ? "var(--accent-line)" : "var(--line)", color: draft.icon === ic ? "var(--accent)" : "var(--tx-mid)", background: draft.icon === ic ? "var(--accent-dim)" : "var(--bg-0)" }, onClick: () => patch({ icon: ic }) }, e(Icon, { name: ic, size: 16 }))))),
      e("div", { className: "field" }, e("label", null, "Category"),
        e(Select, { block: true, value: draft.category, onChange: v => patch({ category: v }), options: CAT_ORDER.map(v => ({ value: v, label: CAT_LABEL[v] })) })),
      e("div", { className: "field" },
        e("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 } },
          e("label", { style: { marginBottom: 0 } }, "Timeout"),
          e("label", { style: { display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12, color: "var(--tx-mid)", fontWeight: 400 } },
            "No timeout",
            e("button", { type: "button", className: "toggle" + (draft.timeout == null ? " on" : ""), onClick: () => patch({ timeout: draft.timeout == null ? 300 : null }) }))),
        e("input", { className: "input mono" + (timeoutErr ? " invalid" : ""), type: "number", min: 1, step: 1, value: draft.timeout == null ? "" : draft.timeout, disabled: draft.timeout == null, "aria-invalid": !!timeoutErr, placeholder: draft.timeout == null ? "no limit" : "", style: draft.timeout == null ? { opacity: 0.5 } : null, onChange: ev => { const raw = ev.target.value; if (raw === "") { patch({ timeout: "" }); return; } const n = parseInt(raw, 10); patch({ timeout: isNaN(n) ? "" : Math.max(1, n) }); } }),
        timeoutErr
          ? e("div", { className: "field-err" }, e(Icon, { name: "alert", size: 13 }), "Enter a whole number of seconds (1 or more).")
          : e("div", { className: "hint" }, draft.timeout == null ? "Task runs until it finishes or is cancelled." : "Killed after this many seconds.")),
      !isNew && e(DeleteTask, { draft, taskId, usedBy, ctx }));
  }

  // Delete option — surfaced only on existing tasks. Deleting is allowed only when
  // no workflow references the task; otherwise the action is disabled and we explain
  // which workflows still depend on it.
  function DeleteTask({ draft, taskId, usedBy, ctx }) {
    const canDelete = usedBy === 0;
    const confirmDelete = () => {
      if (!canDelete) return;
      ctx.confirm({
        icon: "trash", title: "Delete task",
        message: e(React.Fragment, null, "Delete ", e("b", null, draft.name), "? This can't be undone."),
        confirmLabel: "Delete task",
        onConfirm: () => ctx.deleteTask(taskId),
      });
    };
    return e("div", { className: "field", style: { marginTop: 30, paddingTop: 22, borderTop: "1px solid var(--line)" } },
      e("label", { style: { color: "var(--tx-mid)" } }, "Delete task"),
      e("div", { className: "hint", style: { marginTop: -2, marginBottom: 12 } },
        canDelete
          ? "This task isn't used by any workflow, so it's safe to delete. This can't be undone."
          : "In use by " + usedBy + (usedBy === 1 ? " workflow" : " workflows") + " — remove it from " + (usedBy === 1 ? "that workflow" : "those workflows") + " before it can be deleted."),
      e("button", { className: "btn btn-danger", disabled: !canDelete,
        title: canDelete ? "Delete this task" : "Can't delete — still in use",
        onClick: confirmDelete },
        e(Icon, { name: "trash", size: 14 }), "Delete task"));
  }

  function EnvTab({ draft, setDraft, errors = [] }) {
    function setEnv(env) { setDraft(d => ({ ...d, env })); }
    return e("div", { style: { paddingTop: 2 } },
      e("div", { style: { fontSize: 12.5, color: "var(--tx-lo)", marginBottom: 14 } }, "Parameters injected as environment variables into every step in this task."),
      draft.env.length === 0 && e("div", { className: "empty", style: { padding: "26px 0" } }, "No environment variables."),
      e("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
        draft.env.map((row, i) =>
          e(React.Fragment, { key: i },
            e("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr auto 32px", gap: 8, alignItems: "center" } },
              e("input", { className: "input mono" + (errors[i] ? " invalid" : ""), value: row.k, placeholder: "KEY", "aria-invalid": !!errors[i], onChange: ev => setEnv(draft.env.map((r, j) => j === i ? { ...r, k: ev.target.value } : r)) }),
              e("input", { className: "input mono", value: row.v, placeholder: row.required ? "value required" : "value (optional)", onChange: ev => setEnv(draft.env.map((r, j) => j === i ? { ...r, v: ev.target.value } : r)) }),
              e("button", { type: "button", className: "req-toggle" + (row.required ? " on" : ""), title: row.required ? "Required — click to make optional" : "Optional — click to make required", onClick: () => setEnv(draft.env.map((r, j) => j === i ? { ...r, required: !r.required } : r)) },
                e(Icon, { name: row.required ? "check" : "plus", size: 12 }), row.required ? "required" : "optional"),
              e("button", { className: "btn icon btn-ghost", onClick: () => setEnv(draft.env.filter((_, j) => j !== i)) }, e(Icon, { name: "x", size: 15 }))),
            errors[i] && e("div", { className: "field-err", style: { marginTop: -2 } }, e(Icon, { name: "alert", size: 13 }), errors[i])))),
      e("button", { className: "btn sm btn-ghost", style: { marginTop: 12 }, onClick: () => setEnv([...draft.env, { k: "", v: "", required: false }]) },
        e(Icon, { name: "plus", size: 14 }), "Add variable"));
  }

  function buildVersions(rec) {
    const list = [{ version: rec.version, savedAt: rec.savedAt, current: true, data: rec }];
    (rec.history || []).forEach(h => list.push({ version: h.version, savedAt: h.savedAt, current: false, data: h }));
    return list.sort((a, b) => b.version - a.version);
  }
  function copyVer(d) {
    return { ...d, env: (d.env || []).map(x => ({ ...x })), steps: (d.steps || []).map(x => ({ ...x })) };
  }

  window.Views = window.Views || {};
  Object.assign(window.Views, { TasksLibrary });
  window.TaskEditor = TaskEditor;
  window.TaskDetail = TaskDetail;
})();
