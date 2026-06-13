/* ============================================================
   Workflows list + Workflow detail + Pipeline + editor + run prepare
   Exposes window.Views.WorkflowsList / WorkflowDetail
   ============================================================ */
(function () {
  "use strict";
  const { e, Icon, Btn, Select } = window.UI;
  const { useState, useEffect, useRef } = React;
  const DB = window.DB;

  // Mock clock: the prototype anchors all time to DB.NOW_SEC, so "now" is that
  // fixed instant in ms (not the wall clock). Re-render once a second while
  // `active`, advancing past the anchor so the scheduled countdown stays live.
  function useNow(active) {
    const base = DB.NOW_SEC * 1000;
    const start = useRef(Date.now());
    const [, setTick] = useState(0);
    useEffect(() => {
      if (!active) return;
      const id = setInterval(() => setTick(t => t + 1), 1000);
      return () => clearInterval(id);
    }, [active]);
    return base + (Date.now() - start.current);
  }

  // "in 2h 5m 3s" — time from now (ms) until the target epoch seconds, to the
  // second. Once a higher unit appears every lower one follows. Past/now → "now".
  function fmtCountdown(targetSec, nowMs) {
    if (targetSec == null) return "—";
    let s = Math.round(targetSec - nowMs / 1000);
    if (s <= 0) return "now";
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60);
    if (!d && !h && !m) return "in <1m";
    const parts = [];
    if (d) parts.push(d + "d");
    if (d || h) parts.push(h + "h");
    parts.push(m + "m");
    return "in " + parts.join(" ");
  }

  // Mock data carries lastRun as a relative string ("10h ago"); derive a canonical
  // timestamp from it, anchored on NOW_SEC, so the list can show a mono "lastRunAt".
  function lastRunSec(rel) {
    if (!rel || rel === "never") return null;
    if (rel === "just now") return DB.NOW_SEC;
    const m = /(\d+)\s*([smhd])/.exec(rel);
    if (!m) return null;
    const n = Number(m[1]);
    const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]] || 1;
    return DB.NOW_SEC - n * unit;
  }

  function flatTasks(stages) {
    const out = [];
    stages.forEach((s, gi) => {
      if (Array.isArray(s)) s.forEach(id => out.push({ id, gi, parallel: true }));
      else out.push({ id: s, gi, parallel: false });
    });
    return out;
  }

  // A workflow's stages, normalized: an array of stages, each an array of task ids.
  function stagesOf(w) {
    return (w.stages || []).map(el => Array.isArray(el) ? el.slice() : [el]);
  }

  // Workflow version list: current record + verHistory snapshots, newest first.
  function buildWfVersions(rec) {
    if (!rec) return [];
    const list = [{ version: rec.version || 1, savedAt: rec.savedAt, current: true, data: rec }];
    (rec.verHistory || []).forEach(h => list.push({ version: h.version, savedAt: h.savedAt, current: false, data: h }));
    return list.sort((a, b) => b.version - a.version);
  }
  // Stage version list: current record + history snapshots, newest first.
  function taskVerList(s) {
    if (!s) return [];
    const list = [{ version: s.version || 1, savedAt: s.savedAt, current: true }];
    (s.history || []).forEach(h => list.push({ version: h.version, savedAt: h.savedAt, current: false }));
    return list.sort((a, b) => b.version - a.version);
  }
  // Editable deep copy of a workflow/version into draft shape (stages + override maps).
  function copyWfVer(d) {
    return {
      ...d,
      stages: stagesOf(d),
      wfParams: d.wfParams ? JSON.parse(JSON.stringify(d.wfParams)) : {},
      params: d.params ? JSON.parse(JSON.stringify(d.params)) : {},
      exec: d.exec ? JSON.parse(JSON.stringify(d.exec)) : {},
      triggers: d.triggers ? d.triggers.map(t => ({ ...t })) : [],
    };
  }

  // ---- parameter resolution -------------------------------------------
  // Precedence (low → high): stage default → workflow param → per-stage override.
  // resolveParam returns the effective value and where it comes from, so the UI
  // can show what a field inherits vs. what's explicitly set at this level.
  function resolveParam(p, taskId, wfParams, params) {
    const taskDefault = p.v != null ? p.v : "";
    const wfRaw = wfParams ? wfParams[p.k] : undefined;
    const hasWf = wfRaw !== undefined && wfRaw !== "";
    const sp = (params && params[taskId]) || {};
    const ov = sp[p.k];
    const hasOverride = ov !== undefined;
    const inherited = hasWf ? wfRaw : taskDefault;            // value used if no stage override
    const effective = hasOverride ? ov : inherited;
    const source = hasOverride ? "stage" : hasWf ? "workflow" : "default";
    return { effective, inherited, hasOverride, hasWf, wfVal: wfRaw, taskDefault, source, ov };
  }

  /* ---------------- WORKFLOWS LIST ---------------- */
  function WorkflowsList({ ctx }) {
    const [tab, setTab] = useState("all");
    const [q, setQ] = useState("");
    const wfs = ctx.workflows.filter(w => {
      if (tab === "scheduled" && w.schedule.type !== "cron") return false;
      if (q && !w.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });

    const counts = {
      all: ctx.workflows.length,
      scheduled: ctx.workflows.filter(w => w.schedule.type === "cron").length,
    };

    return e("div", { className: "page fadein" },
      e("div", { className: "ph" },
        e("div", null,
          e("h1", null, "Workflows"),
          e("p", null, "Orchestrated pipelines of reusable tasks. ", e("b", { style: { color: "var(--tx-mid)" } }, counts.all + " workflows"), " · " + counts.scheduled + " scheduled")),
        e("div", { className: "ph-actions" },
          e(Btn, { variant: "primary", icon: "plus", onClick: () => ctx.newWorkflow() }, "New workflow"))),

      e("div", { className: "toolbar" },
        e("div", { className: "seg" },
          ["all", "scheduled"].map(t =>
            e("button", { key: t, className: tab === t ? "on" : "", onClick: () => setTab(t) },
              t[0].toUpperCase() + t.slice(1), counts[t] != null ? " · " + counts[t] : ""))),
        e("div", { className: "topbar-spacer" }),
        e("div", { className: "searchbox", style: { width: 220 } },
          e(Icon, { name: "search", size: 15 }),
          e("input", { placeholder: "Search workflows…", value: q, onChange: ev => setQ(ev.target.value) }))),

      e("div", { className: "wf-table" },
        e("div", { className: "wf-head" },
          e("span", null, "Workflow"),
          e("span", null, "Last run"),
          e("span", null, "Scheduled"), e("span", null, "")),
        e(WfRows, { wfs, ctx }),
        wfs.length === 0 && e("div", { className: "empty" }, "No workflows match.")));
  }

  // One shared per-second tick drives every scheduled countdown; only runs when
  // at least one visible workflow is cron-scheduled.
  function WfRows({ wfs, ctx }) {
    const hasCron = wfs.some(w => w.schedule.type === "cron");
    const now = useNow(hasCron);
    return wfs.map(w => e(WfRow, { key: w.id, w, ctx, now }));
  }

  function WfRow({ w, ctx, now }) {
    const sched = w.schedule;
    return e("div", { className: "wf-row", onClick: () => ctx.nav({ view: "workflow", workflowId: w.id }) },
      e("div", { className: "wf-name" },
        e("div", { className: "nm" }, w.name),
        e("div", { className: "ds" }, w.desc)),
      e("div", null,
        (() => {
          const everRan = w.lastRun && w.lastRun !== "never";
          const ranSec = lastRunSec(w.lastRun);
          const lastRunAt = ranSec != null ? window.UI.fmtTimestamp(ranSec, ctx.timezone, { zone: true }) : null;
          return e("div", { style: { display: "flex", flexDirection: "column", gap: 2 } },
            e("span", { style: { fontSize: 13, color: everRan ? "var(--tx)" : "var(--tx-lo)" } }, everRan ? w.lastRun : "—"),
            everRan && lastRunAt && e("span", { className: "mono", style: { fontSize: 11, color: "var(--tx-lo)" } }, lastRunAt));
        })()),
      e("div", null,
        sched.type === "cron"
          ? (() => {
              const nextSec = DB.nextCronRun(sched.cron, DB.NOW_SEC);
              return e("div", { style: { display: "flex", flexDirection: "column", gap: 2 } },
                e("span", { className: "mono", style: { fontSize: 13, color: "var(--tx)" } }, fmtCountdown(nextSec, now)),
                e("span", { className: "mono", style: { fontSize: 11, color: "var(--tx-lo)" } }, sched.next || "—"));
            })()
          : e("span", { style: { fontSize: 13, color: "var(--tx-lo)" } }, "—")),
      e("div", { style: { display: "flex", alignItems: "center", justifyContent: "flex-end" } },
        e(Icon, { name: "chevR", size: 15, style: { color: "var(--tx-lo)" } })));
  }

  /* ---------------- WORKFLOW DETAIL ---------------- */
  function WorkflowDetail({ ctx }) {
    const w = ctx.workflows.find(x => x.id === ctx.state.workflowId);

    // ---- version browsing (read-only preview of past workflow versions) ----
    const versions = buildWfVersions(w);
    const curVer = (w && w.version) || 1;
    const [selVer, setSelVer] = useState(curVer);

    // reset to current when navigating to another workflow, or after a restore bumps the version
    useEffect(() => { setSelVer(curVer); }, [ctx.state.workflowId, curVer]);
    if (!w) return e("div", { className: "page page-wide fadein" },
      e("div", { className: "empty", style: { padding: "60px 0" } }, "Workflow not found."));

    const selEntry = versions.find(v => v.version === selVer) || versions[0];
    const viewingOld = !!selEntry && selVer !== curVer;
    const selData = selEntry ? selEntry.data : w;
    const selSavedAt = selEntry && selEntry.savedAt;
    // the workflow as it looked at the selected version (identity stays current)
    const viewW = viewingOld
      ? { ...w, name: selData.name, desc: selData.desc, stages: selData.stages || [], schedule: selData.schedule || w.schedule }
      : w;
    const flat = flatTasks(viewW.stages);

    function restoreVersion() {
      ctx.saveWorkflow({
        id: w.id, name: selData.name, desc: selData.desc,
        wfParams: selData.wfParams ? JSON.parse(JSON.stringify(selData.wfParams)) : {},
        params: selData.params ? JSON.parse(JSON.stringify(selData.params)) : {},
        exec: selData.exec ? JSON.parse(JSON.stringify(selData.exec)) : {},
        triggers: (selData.triggers || w.triggers || []).map(t => ({ ...t })),
        schedule: selData.schedule || w.schedule,
        stages: JSON.parse(JSON.stringify(selData.stages || [])),
      });
    }

    return e("div", { className: "page page-wide fadein" },
      // header
      e("div", { className: "ph" },
        e("div", { style: { minWidth: 0 } },
          e("div", { style: { display: "flex", alignItems: "center", gap: 11, marginBottom: 3, flexWrap: "wrap" } },
            e("h1", { style: { margin: 0 } }, viewW.name),
            e(Select, { mono: true, ariaLabel: "Workflow version", minWidth: 116, style: { flex: "none" }, btnStyle: { height: 30, padding: "0 30px 0 11px", fontSize: 12.5, borderRadius: 8 }, value: selVer, onChange: v => setSelVer(Number(v)), options: versions.map(v => ({ value: v.version, label: "v" + v.version + (v.current ? " · current" : " · " + (v.savedAt || "")) })) })),
          e("p", null, viewW.desc)),
        e("div", { className: "ph-actions" },
          e(Btn, { icon: "play", onClick: () => ctx.nav({ view: "prepare", workflowId: w.id }) }, "Run"),
          e(Btn, { icon: "copy", onClick: () => ctx.toast("Cloned " + w.name) }, "Clone"),
          e(Btn, { variant: "primary", icon: "edit", onClick: () => ctx.editWorkflow(w) }, "Edit"))),

      viewingOld && e("div", { className: "ver-banner" },
        e(Icon, { name: "clock", size: 14 }),
        e("span", null, "Viewing ", e("b", null, "v" + selVer), selSavedAt ? " (saved " + selSavedAt + ")" : "", " — an older version. Restoring brings it back as v" + (curVer + 1) + "."),
        e("div", { style: { marginLeft: "auto", display: "flex", gap: 8, flex: "none" } },
          e("button", { className: "btn sm btn-ghost", onClick: () => setSelVer(curVer) }, "Back to current"),
          e(Btn, { size: "sm", variant: "primary", icon: "sync", onClick: restoreVersion }, "Restore as v" + (curVer + 1)))),

      // pipeline
      e("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 0 12px" } },
        e("div", { className: "section-title", style: { margin: 0 } }, stagesOf(viewW).length + " stages · " + flat.length + " tasks")),

      viewingOld ? e(Pipeline, { w: viewW, run: null, taskStatus: () => null, ctx }) : e(PipelineMini, { w: viewW, ctx }),

      // recent runs
      e("div", { style: { display: "grid", gridTemplateColumns: "1fr", gap: 16, marginTop: 22 } },
        e(RecentRuns, { w, ctx })));
  }

  function PipelineMini({ w, ctx }) {
    const steps = stagesOf(w);
    return e("div", { className: "pipe-wrap", style: { padding: "16px 18px", overflowX: "auto" } },
      e("div", { style: { display: "flex", alignItems: "center", gap: 8, minWidth: "min-content" } },
        steps.map((step, si) => [
          si > 0 && e("span", { key: "a" + si, style: { color: "var(--tx-dim)", display: "inline-flex", flex: "none" } }, e(Icon, { name: "chevR", size: 14 })),
          e("div", { key: si, style: { display: "flex", flexDirection: "column", gap: 6, flex: "none" } },
            step.map(id => {
              const s = DB.taskById[id];
              if (!s) return null;
              return e("button", { key: id, className: "chip", style: { cursor: "pointer" }, onClick: () => ctx.openTask(id) },
                e(Icon, { name: s.icon, size: 13 }), s.name);
            }))
        ])));
  }

  // Full per-task status pipeline — used when viewing an older/historical version
  // (taskStatus returns null there, so nodes render their static timeout chip).
  function Pipeline({ w, run, taskStatus, ctx }) {
    const steps = stagesOf(w);
    let flatIdx = -1;
    return e("div", { className: "pipe-wrap" },
      e("div", { className: "pipe-track" },
        steps.map((step, si) => {
          const multi = step.length > 1;
          const inner = multi
            ? e("div", { className: "parallel-wrap" }, step.map(id => { flatIdx++; return e(TaskNode, { key: id, id, status: taskStatus(flatIdx), ctx }); }))
            : (() => { flatIdx++; return e(TaskNode, { id: step[0], status: taskStatus(flatIdx), ctx }); })();
          const col = e("div", { className: "pipe-col", key: "c" + si },
            e("div", { className: "stage-tag" }, "Stage " + (si + 1), multi ? e("span", { className: "stage-tag-n" }, step.length) : null),
            inner);
          return [si > 0 && e(Connector, { key: "pre" + si }), col];
        })));
  }

  function Connector() {
    return e("div", { className: "pipe-conn" }, e("div", { className: "line" }));
  }

  function TaskNode({ id, status, ctx }) {
    const s = DB.taskById[id];
    if (!s) return null;
    const active = status === "ok" || status === "fail" || status === "running";
    const queued = status === "queued";
    const cls = "node" + (status === "running" ? " running" : "");
    const badgeCls = status === "ok" ? "st-ok" : status === "fail" ? "st-fail" : status === "running" ? "st-run" : "st-warn";
    const dotCls = status === "ok" ? "st-ok" : status === "fail" ? "st-fail" : status === "running" ? "st-run pulse" : "st-warn";
    const label = status === "running" ? "run" : status === "ok" ? "ok" : status === "fail" ? "fail" : "queued";
    return e("button", { className: cls, onClick: () => ctx.openTask(id) },
      e("div", { className: "node-top" },
        e("div", { className: "node-ic" }, e(Icon, { name: s.icon, size: 15 })),
        e("div", { style: { minWidth: 0 } },
          e("div", { className: "node-nm" }, s.name),
          e("div", { className: "node-sub" }, s.category))),
      e("div", { className: "node-foot" },
        e("div", { className: "steps" }, e(Icon, { name: "terminal", size: 12 }), s.steps.length + (s.steps.length === 1 ? " step" : " steps")),
        (active || queued)
          ? e("span", { className: "badge " + badgeCls, style: { height: 19, padding: "0 6px", fontSize: 10.5 } },
              e("span", { className: "dot " + dotCls }), label)
          : e("span", { className: "node-dur" }, fmtTimeout(s.timeout))));
  }
  function fmtTimeout(s) { return s == null ? "no limit" : s >= 60 ? Math.round(s / 60) + "m" : s + "s"; }

  function RecentRuns({ w, ctx }) {
    const { RunRow, Pager, RUN_COLS, PAGE_SIZE } = window.RunsUI;
    const all = DB.RUNS.filter(r => r.wf === w.id);
    const [page, setPage] = useState(1);
    const total = all.length;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const cur = Math.min(page, pageCount);
    const start = (cur - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);
    const pageRuns = all.slice(start, end);
    return e("div", { className: "card", style: { overflow: "hidden" } },
      total
        ? e(React.Fragment, null,
            e("div", { className: "wf-head", style: { gridTemplateColumns: RUN_COLS } },
              e("span", null, "Execution"),
              e("span", null, "Status"),
              e("span", null, "Trigger"),
              e("span", null, "Duration"),
              e("span", null, "Started"),
              e("span", null, "")),
            e("div", null,
              pageRuns.map(r => e(RunRow, { key: r.id, r, tz: ctx.timezone, onClick: () => ctx.nav({ view: "run", runId: r.id, workflowId: w.id }) }))),
            e(Pager, { page: cur, pageCount, onPage: setPage, total, start, end }))
        : e("div", { className: "empty", style: { padding: 30 } }, "No runs yet"));
  }

  /* ---------------- WORKFLOW EDIT (stages) ---------------- */
  function StageEditCard({ step, si, isFirst, isLast, isOnly, onAddTask, onRemoveTask, onMove, onRemoveStage, params, setParam, resetParam, wfParams, getExec, setExec, ctx }) {
    const [expanded, setExpanded] = useState({});
    return e("div", { className: "stage-edit" },
      e("div", { className: "stage-edit-h" },
        e("span", { className: "st-num" }, "Stage " + (si + 1)),
        e("span", { style: { fontSize: 12, color: "var(--tx-lo)" } }, step.length === 0 ? "empty" : step.length === 1 ? "1 task" : step.length + " tasks"),
        e("div", { style: { marginLeft: "auto", display: "flex", gap: 3 } },
          e("button", { className: "btn icon sm btn-ghost", disabled: isFirst, onClick: () => onMove(-1), title: "Move stage up" }, e(Icon, { name: "chevD", size: 14, style: { transform: "rotate(180deg)" } })),
          e("button", { className: "btn icon sm btn-ghost", disabled: isLast, onClick: () => onMove(1), title: "Move stage down" }, e(Icon, { name: "chevD", size: 14 })),
          e("button", { className: "btn icon sm btn-ghost", style: { color: "var(--st-fail)" }, disabled: isOnly, onClick: onRemoveStage, title: isOnly ? "A workflow needs at least one stage" : "Remove stage" }, e(Icon, { name: "trash", size: 14 })))),
      e("div", { className: "stage-edit-b" },
        step.length === 0 ? e("div", { className: "field-err", style: { margin: "0 0 10px" } }, e(Icon, { name: "alert", size: 13 }), "This stage needs at least one task — add one below.") : null,
        step.map((id, j) => {
          const s = DB.taskById[id];
          if (!s) return null;
          const env = s.env || [];
          const open = !!expanded[j];
          const taskParams = params[id] || {};
          const wfp = wfParams || {};
          const overrideCount = env.filter(p => taskParams[p.k] !== undefined).length;
          const wfCount = env.filter(p => { const r = resolveParam(p, id, wfp, params); return r.source === "workflow"; }).length;
          return e("div", { key: id + "-" + j, className: "task-block" + (open ? " open" : "") },
            e("div", { className: "step-item", onClick: () => setExpanded(x => ({ ...x, [j]: !x[j] })), title: open ? "Hide configuration" : "Configure task" },
              e("div", { className: "si-ic" }, e(Icon, { name: s.icon, size: 15 })),
              e("div", { className: "si-m" },
                e("div", { className: "n" }, s.name),
                e("div", { className: "d" }, s.category + " · " + s.steps.length + (s.steps.length === 1 ? " step" : " steps"))),
              e("div", { className: "task-toggles" },
                env.length > 0
                  ? e("span", { className: "task-meta" },
                      e(Icon, { name: "terminal", size: 12 }),
                      e("span", null, env.length + (env.length === 1 ? " parameter" : " parameters")),
                      overrideCount > 0 ? e("span", { className: "param-badge", title: overrideCount + " overridden" }, overrideCount) : null)
                  : null,
                e(Icon, { name: "chevD", size: 14, className: "task-chev", style: { transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", color: "var(--tx-lo)" } })),
              e("button", { className: "btn icon sm btn-ghost", style: { color: "var(--st-fail)" }, onClick: (ev) => { ev.stopPropagation(); onRemoveTask(j); }, title: "Remove from stage" }, e(Icon, { name: "x", size: 15 }))),
            open
              ? e("div", { className: "task-panel" },
                  env.length > 0
                    ? [
                        e("div", { className: "task-panel-h", key: "ph" },
                          e(Icon, { name: "terminal", size: 12 }),
                          e("span", null, "Parameters"),
                          e("span", { className: "sp-sub" }, wfCount > 0 ? wfCount + (wfCount === 1 ? " value from workflow" : " values from workflow") : "environment variables")),
                        e("div", { className: "task-panel-b", key: "pb" },
                          env.map((p) => {
                            const r = resolveParam(p, id, wfp, params);
                            const placeholder = r.inherited === "" ? (p.required ? "value required" : "value (optional)") : r.inherited;
                            return e("div", { key: p.k, className: "param-row" },
                              e("div", { className: "param-k" },
                                e("span", { className: "param-key", title: p.k }, p.k),
                                r.source === "workflow"
                                  ? e("span", { className: "src-chip wf", title: "Inherited from workflow parameter" }, "workflow")
                                  : r.hasOverride && r.hasWf
                                  ? e("span", { className: "src-chip ov", title: "Overrides the workflow value · " + r.wfVal }, "overrides wf")
                                  : null,
                                e("span", { className: "param-req" + (p.required ? " on" : "") }, p.required ? "required" : "optional")),
                              e("div", { className: "param-val-cell" },
                                e("input", { className: "input mono param-v" + (r.hasOverride ? " modified" : ""), value: r.hasOverride ? r.ov : "", placeholder, onChange: ev => setParam(id, p.k, ev.target.value) })));
                          })),
                      ]
                    : null,
                  e("div", { className: "task-panel-h", key: "sh" },
                    e(Icon, { name: "settings", size: 12 }),
                    e("span", null, "Settings")),
                  e("div", { className: "task-panel-b", key: "sb" }, e(TaskExec, { ex: getExec(id), stage: s, onChange: (p) => setExec(id, p) })))
              : null);
        }),
        e(AddTaskMenu, { stages: ctx.tasks, onPick: onAddTask })));
  }

  function TaskExec({ ex, stage, onChange }) {
    const vers = taskVerList(stage);
    const curV = (stage && stage.version) || 1;
    const pinnedOld = ex.version !== "latest" && ex.version < curV;
    const clampInt = (v) => Math.max(0, Math.floor(Number(v) || 0));
    // friendly seconds → label (used in the helper text only)
    const fmtT = (s) => s >= 60 && s % 60 === 0 ? (s / 60) + (s === 60 ? " min" : " min") : s + " s";
    const retriesEff = ex.retries != null ? ex.retries : 0;  // default: 0
    const timeoutEff = ex.timeout != null ? ex.timeout : 600;  // default: 10 minutes
    const timeoutOn = ex.timeout !== null;  // null = timeout disabled (no limit)
    return e("div", { className: "task-exec" },
      e("div", { className: "exec-row" },
        e("div", { className: "ex-l" },
          e("div", { className: "t" }, "Task version"),
          e("div", { className: "d" + (pinnedOld ? " warn" : "") }, ex.version === "latest"
            ? "Always run the latest version — currently v" + curV + "."
            : pinnedOld
            ? "Pinned to v" + ex.version + " · v" + curV + " is now available."
            : "Pinned to v" + ex.version + " · the current version.")),
        e("div", { className: "ex-c" },
          e(Select, { mono: true, align: "right", ariaLabel: "Task version", minWidth: 150, btnStyle: { height: 34, padding: "0 30px 0 11px", fontSize: 12.5 }, value: String(ex.version), onChange: v => onChange({ version: v === "latest" ? "latest" : Number(v) }), options: [{ value: "latest", label: "Latest (auto-update)" }].concat(vers.map(v => ({ value: String(v.version), label: "v" + v.version + (v.savedAt ? " · " + v.savedAt : "") + (v.current ? " · current" : "") }))) }))),
      e("div", { className: "exec-row" },
        e("div", { className: "ex-l" },
          e("div", { className: "t" }, "Continue on failure"),
          e("div", { className: "d" }, "Run the next stage even if this task fails.")),
        e("div", { className: "ex-c" },
          e("button", { type: "button", role: "switch", "aria-checked": !!ex.continueOnFailure, className: "toggle" + (ex.continueOnFailure ? " on" : ""), onClick: () => onChange({ continueOnFailure: !ex.continueOnFailure }) }))),
      e("div", { className: "exec-row" },
        e("div", { className: "ex-l" },
          e("div", { className: "t" }, "Retry count"),
          e("div", { className: "d" }, retriesEff === 0 ? "No retries · fails on the first error." : "Retry up to " + retriesEff + (retriesEff === 1 ? " time" : " times") + " before failing.")),
        e("div", { className: "ex-c" },
          e("input", { type: "number", min: 0, step: 1, "aria-label": "Retry count", className: "input mono", style: { width: 92, textAlign: "right" }, value: retriesEff, onChange: ev => onChange({ retries: clampInt(ev.target.value) }) }))),
      e("div", { className: "exec-row" },
        e("div", { className: "ex-l" },
          e("div", { className: "t" }, "Timeout"),
          e("div", { className: "d" }, !timeoutOn ? "Disabled · runs until it finishes." : timeoutEff === 0 ? "Cancels immediately (0 s)." : "Cancel if it runs longer than " + fmtT(timeoutEff) + ".")),
        e("div", { className: "ex-c", style: { display: "flex", alignItems: "center", gap: 8 } },
          e("button", { type: "button", role: "switch", "aria-checked": timeoutOn, "aria-label": "Enable timeout", className: "toggle" + (timeoutOn ? " on" : ""), onClick: () => onChange({ timeout: timeoutOn ? null : timeoutEff }) }),
          e("input", { type: "number", min: 0, step: 1, "aria-label": "Timeout in seconds", disabled: !timeoutOn, className: "input mono", style: { width: 92, textAlign: "right", opacity: timeoutOn ? 1 : 0.45 }, value: timeoutEff, onChange: ev => onChange({ timeout: clampInt(ev.target.value) }) }),
          e("span", { style: { fontSize: 12, color: "var(--tx-lo)", opacity: timeoutOn ? 1 : 0.45 } }, "sec"))));
  }

  function AddTaskMenu({ stages, onPick }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const onDoc = (ev) => { if (ref.current && !ref.current.contains(ev.target)) setOpen(false); };
      const onKey = (ev) => { if (ev.key === "Escape") setOpen(false); };
      window.addEventListener("mousedown", onDoc);
      window.addEventListener("keydown", onKey);
      return () => { window.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
    }, [open]);
    return e("div", { className: "add-task", ref },
      e("button", { type: "button", className: "btn sm btn-ghost" + (open ? " active" : ""), onClick: () => setOpen(o => !o) },
        e(Icon, { name: "plus", size: 15 }), "Add task",
        e(Icon, { name: "chevD", size: 12, style: { transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", opacity: 0.6 } })),
      open ? e("div", { className: "add-task-menu" },
        e("div", { className: "add-task-head" }, "Add a task to this stage"),
        stages.map(s => e("button", { key: s.id, type: "button", className: "add-task-item", onClick: () => { onPick(s.id); setOpen(false); } },
          e("div", { className: "asi-ic" }, e(Icon, { name: s.icon, size: 14 })),
          e("div", { className: "asi-m" },
            e("div", { className: "asi-n" }, s.name),
            e("div", { className: "asi-d" }, s.category + " · " + s.steps.length + (s.steps.length === 1 ? " step" : " steps"))),
          e(Icon, { name: "plus", size: 13, style: { color: "var(--tx-dim)", marginLeft: "auto" } })))) : null);
  }

  function WorkflowEdit({ ctx }) {
    const creating = ctx.state.workflowId === "__new";
    const cur = creating ? null : ctx.workflows.find(x => x.id === ctx.state.workflowId);
    // initial tab: an explicit editTab from navigation, else Config (not remembered)
    const seedTab = (st) => st.editTab === "params" ? "config" : (st.editTab || "config");
    const [tab, setTab] = useState(seedTab(ctx.state));
    const versions = creating ? [] : buildWfVersions(cur);
    const curVer = (cur && cur.version) || 1;
    const cacheKey = ctx.state.workflowId || "__new";
    const freshDraft = () => creating
      ? { id: "__new", name: "", desc: "", stages: [[]], wfParams: {}, params: {}, exec: {}, triggers: [] }
      : copyWfVer(cur || {});
    // Draft state — local only; loads fresh, nothing preserved across navigation
    // (mirrors useEditorDraft). Entity/version switches reload from saved data.
    const [selVer, setSelVer] = useState(curVer);
    const [draft, setDraft] = useState(freshDraft);
    const prevKey = useRef(cacheKey);
    const prevSel = useRef(selVer);
    // Switch to a *different* workflow within the editor (most switches remount,
    // so this is rare). Reload fresh; guarded so it never fires on mount.
    useEffect(() => {
      if (cacheKey === prevKey.current) return;
      prevKey.current = cacheKey;
      setSelVer(curVer); setDraft(freshDraft()); prevSel.current = curVer;
      setTab(seedTab(ctx.state));
    }, [cacheKey]);
    // Load a different version into the draft when the user picks one from the
    // version dropdown. Guarded so it never fires on mount.
    useEffect(() => {
      if (selVer === prevSel.current) return;
      prevSel.current = selVer;
      const w = ctx.workflows.find(x => x.id === ctx.state.workflowId);
      if (!w) return;
      const vs = buildWfVersions(w);
      const v = vs.find(x => x.version === selVer) || vs[0];
      setDraft({ ...copyWfVer(v ? v.data : w), id: w.id });
    }, [selVer]);
    const viewingOld = selVer !== curVer;
    const selSavedAt = (versions.find(v => v.version === selVer) || {}).savedAt;

    const totalTasks = draft.stages.reduce((n, s) => n + s.length, 0);
    const nameErr = !(draft.name || "").trim();
    const noStages = draft.stages.length === 0;
    const emptyStages = draft.stages.map((s, i) => s.length === 0 ? i + 1 : null).filter(n => n !== null);
    const stagesErr = noStages || emptyStages.length > 0;
    function patch(p) { setDraft(d => ({ ...d, ...p })); }
    function setStages(fn) { setDraft(d => ({ ...d, stages: fn(d.stages) })); }
    function moveStage(i, dir) { setStages(steps => { const j = i + dir; if (j < 0 || j >= steps.length) return steps; const s = steps.map(x => x.slice()); const t = s[i]; s[i] = s[j]; s[j] = t; return s; }); }
    function removeStage(i) { setStages(steps => steps.filter((_, j) => j !== i)); }
    function addStage() { setStages(steps => [...steps, []]); }
    function addTaskToStage(si, id) { if (!id) return; setStages(steps => steps.map((s, j) => j === si ? [...s, id] : s)); }
    function removeTaskFromStage(si, j) { setStages(steps => steps.map((s, k) => k === si ? s.filter((_, m) => m !== j) : s)); }
    function setParam(taskId, k, v) { setDraft(d => ({ ...d, params: { ...d.params, [taskId]: { ...(d.params && d.params[taskId]), [k]: v } } })); }
    function resetParam(taskId, k) { setDraft(d => { const next = { ...(d.params || {}) }; const sp = { ...(next[taskId] || {}) }; delete sp[k]; if (Object.keys(sp).length) next[taskId] = sp; else delete next[taskId]; return { ...d, params: next }; }); }
    function getExec(taskId) {
      const o = (draft.exec && draft.exec[taskId]) || {};
      return {
        continueOnFailure: o.continueOnFailure !== undefined ? o.continueOnFailure : false,
        version: o.version !== undefined ? o.version : "latest",
        enabled: o.enabled !== undefined ? o.enabled : true,
        retries: o.retries,   // undefined → inherit the task's default
        timeout: o.timeout,   // undefined → inherit the task's default; null → explicit "no limit"
      };
    }
    function setExec(taskId, p) { setDraft(d => ({ ...d, exec: { ...(d.exec || {}), [taskId]: { ...getExec(taskId), ...((d.exec && d.exec[taskId]) || {}), ...p } } })); }
    function setTriggers(updater) { setDraft(d => ({ ...d, triggers: typeof updater === "function" ? updater(d.triggers || []) : updater })); }
    function save() {
      if (creating) {
        ctx.createWorkflow({ name: draft.name, desc: draft.desc, wfParams: draft.wfParams || {}, params: draft.params, exec: draft.exec, triggers: draft.triggers || [], stages: draft.stages });
        return;
      }
      const triggers = draft.triggers || [];
      const firstCron = triggers.find(t => t.type === "cron" && t.enabled);
      const schedule = firstCron ? { type: "cron", cron: firstCron.cron, next: "in 6h" } : { type: "manual", cron: null, next: null };
      ctx.saveWorkflow({ id: draft.id, name: draft.name, desc: draft.desc, wfParams: draft.wfParams || {}, params: draft.params, exec: draft.exec, triggers, schedule, stages: draft.stages.filter(s => s.length > 0).map(s => s.slice()) });
    }

    return e("div", { className: "page fadein" },
      e("div", { className: "ph", style: { alignItems: "center" } },
        e("div", { style: { display: "flex", alignItems: "center", gap: 13, minWidth: 0, flex: 1 } },
          e("div", { style: { minWidth: 0 } },
            e("div", { style: { display: "flex", alignItems: "center", gap: 11, minWidth: 0 } },
              creating
                ? e("div", { style: { fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: draft.name ? "var(--tx-hi)" : "var(--tx-lo)", maxWidth: "44ch", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, draft.name || "New workflow")
                : e("input", { className: "wf-title-input" + (nameErr ? " invalid" : ""), placeholder: "workflow-name", style: { background: "transparent", border: "none", padding: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--tx-hi)", outline: "none", fieldSizing: "content", minWidth: "4ch", maxWidth: "44ch", flex: "0 1 auto" }, value: draft.name, "aria-invalid": nameErr, onChange: ev => patch({ name: ev.target.value }) }),
              versions.length > 0 && e(Select, { mono: true, ariaLabel: "Workflow version", minWidth: 116, style: { flex: "none" }, btnStyle: { height: 30, padding: "0 30px 0 11px", fontSize: 12.5, borderRadius: 8 }, value: selVer, onChange: v => setSelVer(Number(v)), options: versions.map(v => ({ value: v.version, label: "v" + v.version + (v.current ? " · current" : " · " + (v.savedAt || "")) })) })))),
        e("div", { className: "ph-actions" },
          e(Btn, { variant: "ghost", onClick: () => { creating ? ctx.nav({ view: "workflows" }) : ctx.nav({ view: "workflow", workflowId: draft.id }); } }, "Cancel"),
          e(Btn, { variant: "primary", icon: creating ? "plus" : (viewingOld ? "sync" : "check"), onClick: save, disabled: nameErr || stagesErr }, creating ? "Create workflow" : (viewingOld ? "Restore as v" + (curVer + 1) : "Save changes")))),

      nameErr && e("div", { className: "field-err", style: { margin: "-8px 0 14px" } },
        e(Icon, { name: "alert", size: 13 }), "Workflow name is required."),

      noStages && e("div", { className: "field-err", style: { margin: "-8px 0 14px" } },
        e(Icon, { name: "alert", size: 13 }), "Add at least one stage in the Stages tab."),

      !noStages && emptyStages.length > 0 && e("div", { className: "field-err", style: { margin: "-8px 0 14px" } },
        e(Icon, { name: "alert", size: 13 }), "Every stage needs at least one task."),

      viewingOld && e("div", { className: "ver-banner" },
        e(Icon, { name: "clock", size: 14 }),
        e("span", null, "Viewing ", e("b", null, "v" + selVer), selSavedAt ? " (saved " + selSavedAt + ")" : "", " — an older version. Saving restores it as v" + (curVer + 1) + "."),
        e("button", { className: "btn sm btn-ghost", style: { marginLeft: "auto", flex: "none" }, onClick: () => setSelVer(curVer) }, "Back to current")),

      e("div", { className: "tabs", style: { paddingLeft: 0, paddingRight: 0 } },
        [["config", "Config"], ["stages", "Stages"], ["triggers", "Triggers"]].map(([id, lbl]) =>
          e("button", { key: id, className: tab === id ? "on" : "", onClick: () => setTab(id) }, lbl,
            id === "stages" ? e("span", { style: { color: "var(--tx-dim)", marginLeft: 6 } }, draft.stages.length) :
            id === "triggers" ? e("span", { style: { color: "var(--tx-dim)", marginLeft: 6 } }, (draft.triggers || []).length) : null))),

      e("div", { style: { paddingTop: 18 } },
        tab === "config" && e("div", { className: "fadein" },
          e("div", { className: "field" },
            e("label", null, "Name"),
            e("input", { className: "input mono", placeholder: creating ? "Workflow name" : undefined, value: draft.name, onChange: ev => patch({ name: ev.target.value }) })),
          e("div", { className: "field" },
            e("label", null, "Description"),
            e("textarea", { className: "textarea", rows: 3, placeholder: creating ? "What does this workflow do?" : undefined, value: draft.desc, onChange: ev => patch({ desc: ev.target.value }) })),
          !creating && e("div", { className: "field", style: { marginTop: 30, paddingTop: 22, borderTop: "1px solid var(--line)" } },
            e("label", { style: { color: "var(--tx-mid)" } }, "Delete workflow"),
            e("div", { className: "hint", style: { marginTop: -2, marginBottom: 12 } },
              "Removes the workflow and its schedule. Run history is retained. This can't be undone."),
            e(Btn, { variant: "danger", icon: "trash", onClick: () => ctx.confirm({
              icon: "trash", title: "Delete workflow",
              message: e(React.Fragment, null, "Delete ", e("b", null, draft.name), "? Its schedule is removed too. Run history is kept. This can't be undone."),
              confirmLabel: "Delete workflow", onConfirm: () => ctx.deleteWorkflow(draft.id) }) }, "Delete workflow"))),

        tab === "stages" && e("div", { className: "fadein" },
          e("div", { style: { fontSize: 12.5, color: "var(--tx-lo)", marginBottom: 14 } }, "Each stage runs all of its tasks at once. The next stage only starts after every task in the current stage finishes."),
          draft.stages.length === 0 && e("div", { className: "empty", style: { padding: "20px 0" } }, "No stages yet — add one below."),
          draft.stages.map((step, si) => e(StageEditCard, {
            key: "s" + si, step, si, ctx,
            isFirst: si === 0, isLast: si === draft.stages.length - 1, isOnly: draft.stages.length === 1,
            params: draft.params || {}, setParam, resetParam,
            wfParams: draft.wfParams || {},
            getExec, setExec,
            onAddTask: (id) => addTaskToStage(si, id),
            onRemoveTask: (j) => removeTaskFromStage(si, j),
            onMove: (dir) => moveStage(si, dir),
            onRemoveStage: () => removeStage(si),
          })),
          e("button", { className: "btn", style: { borderStyle: "dashed", width: "100%", justifyContent: "center", marginTop: 2, height: 38 }, onClick: addStage }, e(Icon, { name: "plus", size: 15 }), "Add stage")),

        tab === "triggers" && e("div", { className: "fadein" },
          window.Views.TriggersPanel
            ? e(window.Views.TriggersPanel, { triggers: draft.triggers || [], setTriggers, ctx })
            : null)));
  }

  /* ---------------- RUN PREPARE (parameter review before launch) ---------------- */
  // Parameters are scoped PER STAGE: if two stages declare the same key, each
  // gets its own input (and keeps its own default), so they can be set apart.
  const pKey = (sid, k) => sid + "::" + k;

  function RunPrepare({ ctx }) {
    const w = ctx.workflows.find(x => x.id === ctx.state.workflowId);
    // When recreating a run ("Re-run"), nav passes the source run's params; seed
    // the inputs from them so the page opens pre-filled with what that execution
    // used.
    const prefill = ctx.state.prefill;

    // distinct stages in pipeline order that declare parameters (computed before
    // the seed so a flat prefill can be distributed across them)
    const taskList = [];
    if (w) {
      const seen = new Set();
      stagesOf(w).forEach(step => step.forEach(id => {
        if (seen.has(id)) return; seen.add(id);
        const s = DB.taskById[id];
        if (s && (s.env || []).length) taskList.push(s);
      }));
    }

    const [vals, setVals] = useState(() => {
      const seed = {};
      // Prefer per-task prefill (taskParams, { taskId: { KEY: value } }) so each
      // task's distinct value is restored exactly; fall back to the flat global
      // params (older runs) by seeding every task that declares the key.
      const tp = prefill && prefill.taskParams;
      if (tp && Object.keys(tp).length) {
        taskList.forEach(s => (s.env || []).forEach(p => {
          const m = tp[s.id];
          if (m && Object.prototype.hasOwnProperty.call(m, p.k)) seed[pKey(s.id, p.k)] = m[p.k];
        }));
      } else if (prefill && prefill.params) {
        taskList.forEach(s => (s.env || []).forEach(p => {
          if (Object.prototype.hasOwnProperty.call(prefill.params, p.k)) seed[pKey(s.id, p.k)] = prefill.params[p.k];
        }));
      }
      return seed;
    });
    if (!w) return e("div", { className: "page page-wide fadein" },
      e("div", { className: "empty", style: { padding: "60px 0" } }, "Workflow not found."));

    const effOf = (sid, p) => { const v = vals[pKey(sid, p.k)]; return (v !== undefined && v !== "") ? v : (p.v != null ? p.v : ""); };
    const setVal = (sid, k, v) => setVals(s => ({ ...s, [pKey(sid, k)]: v }));

    // every required (stage, param) pair that is still empty
    const missing = [];
    taskList.forEach(s => (s.env || []).forEach(p => { if (p.required && !effOf(s.id, p)) missing.push(p.k); }));
    const canRun = missing.length === 0;
    const missKeys = Array.from(new Set(missing));

    function launch() {
      if (!canRun) return;
      const params = {};                       // { taskId: { KEY: value } }
      taskList.forEach(s => (s.env || []).forEach(p => {
        const v = effOf(s.id, p);
        if (v !== "") { (params[s.id] = params[s.id] || {})[p.k] = v; }
      }));
      ctx.launchRun(w, params);
    }

    return e("div", { className: "page page-wide fadein" },
      e("div", { className: "ph" },
        e("div", { style: { minWidth: 0 } },
          e("h1", { style: { margin: 0, display: "flex", alignItems: "center", gap: 10 } },
            (prefill ? "Re-run " : "Run "), e("span", { className: "mono", style: { color: "var(--tx-hi)" } }, w.name),
            e("span", { className: "ver-tag mono" }, "v" + ((prefill && prefill.version) || w.version || 1))),
          e("p", null, prefill && prefill.fromRun
            ? e(React.Fragment, null, "Recreated from ", e("span", { className: "mono" }, prefill.fromRun), prefill.version ? " · v" + prefill.version : "", ". Parameters are pre-filled — adjust any before running.")
            : "Review the parameters for this run, grouped by task. Required fields must be set before the flow can start.")),
        e("div", { className: "ph-actions" },
          e(Btn, { variant: "ghost", onClick: () => ctx.nav({ view: "workflow", workflowId: w.id }) }, "Cancel"),
          e(Btn, { variant: "primary", icon: "play", disabled: !canRun, onClick: launch }, "Run flow"))),

      !canRun && e("div", { className: "prep-warn" },
        e(Icon, { name: "alert", size: 15 }),
        e("span", null, missing.length + (missing.length === 1 ? " required parameter still needs a value" : " required parameters still need a value"),
          " — ", e("b", null, missKeys.join(", ")))),

      taskList.length === 0
        ? e("div", { className: "card" }, e("div", { className: "empty", style: { padding: 30 } }, "This workflow has no parameters — nothing to configure before running."))
        : e("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
            taskList.map(s => e(PrepTaskCard, { key: s.id, s, vals, setVal, effOf }))));
  }

  function PrepTaskCard({ s, vals, setVal, effOf }) {
    const env = s.env || [];
    const missingN = env.filter(p => p.required && !effOf(s.id, p)).length;
    return e("div", { className: "card" },
      e("div", { className: "card-h" },
        e(Icon, { name: s.icon, size: 15, style: { color: "var(--tx-lo)", flex: "none" } }),
        e("h3", null, s.name),
        e("span", { className: "sub", style: { marginLeft: "auto" } },
          env.length + (env.length === 1 ? " parameter" : " parameters") + (missingN ? " · " + missingN + " missing" : ""))),
      e("div", { className: "card-b", style: { padding: 0 } },
        env.map(p => e(PrepParamRow, { key: p.k, sid: s.id, p, vals, setVal, effOf }))));
  }

  function PrepParamRow({ sid, p, vals, setVal, effOf }) {
    const def = p.v != null ? p.v : "";
    const isMissing = p.required && !effOf(sid, p);
    const vKey = pKey(sid, p.k);
    return e("div", { className: "prep-row" + (isMissing ? " missing" : "") },
      e("div", { className: "prep-k" },
        e("span", { className: "param-key" }, p.k),
        e("span", { className: "param-req" + (p.required ? " on" : "") }, p.required ? "required" : "optional")),
      e("div", { className: "prep-v" },
        e("input", { className: "input mono" + (isMissing ? " miss" : ""),
          value: vals[vKey] !== undefined ? vals[vKey] : "",
          placeholder: def ? "default · " + def : (p.required ? "value required" : "value (optional)"),
          onChange: ev => setVal(sid, p.k, ev.target.value) }),
        isMissing && e(Icon, { name: "alert", size: 15, style: { color: "var(--st-fail)", flex: "none" } })));
  }

  window.Views = window.Views || {};
  Object.assign(window.Views, { WorkflowsList, WorkflowDetail, WorkflowEdit, RunPrepare });
})();
