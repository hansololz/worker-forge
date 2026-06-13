/* ============================================================
   Runs (history + terminal logs)
   Exposes window.Views.RunsView
   ============================================================ */
(function () {
  "use strict";
  const { e, Icon, Badge, Dot, Btn, fmtTimestamp, fmtClockOnly, fmtDate, tzShort } = window.UI;
  const { useState, useEffect, useRef } = React;
  const DB = window.DB;

  const PAGE_SIZE = 50;
  const RUN_COLS = "minmax(220px,1fr) 120px 150px 110px 184px 28px";

  // Relative "time ago" anchored to the mock clock (NOW_SEC), mirroring
  // model.fmtAgeIso in the real app.
  function fmtAgo(sec) {
    if (sec == null) return "—";
    const m = Math.floor((DB.NOW_SEC - sec) / 60);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    if (m < 1440) return Math.floor(m / 60) + "h ago";
    return Math.floor(m / 1440) + "d ago";
  }
  // windowed page numbers, e.g. [1, "…", 4, 5, 6, "…", 9]
  function pageWindow(p, n) {
    const out = [1];
    const lo = Math.max(2, p - 1), hi = Math.min(n - 1, p + 1);
    if (lo > 2) out.push("…");
    for (let i = lo; i <= hi; i++) out.push(i);
    if (hi < n - 1) out.push("…");
    if (n > 1) out.push(n);
    return out;
  }

  const wfName = id => (DB.WF.find(w => w.id === id) || {}).name || id;

  /* ---------------- RUNS LIST + DETAIL ---------------- */
  function RunsView({ ctx }) {
    const filterWf = ctx.state.workflowId;
    const [statusF, setStatusF] = useState("all");
    const [page, setPage] = useState(1);
    const listRef = useRef(null);

    let runs = DB.RUNS.slice();
    if (filterWf) runs = runs.filter(r => r.wf === filterWf);
    if (statusF !== "all") runs = runs.filter(r => r.status === statusF);

    const total = runs.length;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const curPage = Math.min(page, pageCount);
    const start = (curPage - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);
    const pageRuns = runs.slice(start, end);

    // a new page (or filter) starts at the top of the list scroller
    useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [curPage, statusF]);

    function changeStatus(s) { setStatusF(s); setPage(1); }
    function goPage(p) { setPage(Math.min(Math.max(1, p), pageCount)); }

    return e("div", { className: "page page-wide fadein" },
      e("div", { className: "ph" },
        e("div", null,
          e("h1", null, filterWf ? "Executions · " + wfName(filterWf) : "Execution history"),
          e("p", null, filterWf ? e("span", { className: "c link", style: { cursor: "pointer", color: "var(--accent)" }, onClick: () => ctx.nav({ view: "workflow", workflowId: filterWf }) }, "← back to workflow") : "Every execution across all workflows, newest first."))),

      e("div", { className: "toolbar" },
        e("div", { className: "seg" },
          ["all", "succeeded", "failed"].map(s => e("button", { key: s, className: statusF === s ? "on" : "", onClick: () => changeStatus(s) },
            s === "all" ? "All" : s === "succeeded" ? "Succeeded" : "Failed")))),

      e("div", { className: "card", style: { overflow: "hidden" } },
        e("div", { className: "wf-head", style: { gridTemplateColumns: RUN_COLS } },
          e("span", null, "Execution"),
          e("span", null, "Status"),
          e("span", null, "Trigger"),
          e("span", null, "Duration"),
          e("span", null, "Started"),
          e("span", null, "")),
        e("div", { ref: listRef },
          pageRuns.map(r => e(RunRow, { key: r.id, r, tz: ctx.timezone, onClick: () => ctx.nav({ view: "run", runId: r.id, workflowId: filterWf || null }) })),
          total === 0 && e("div", { className: "empty" }, "No runs.")),
        e(Pager, { page: curPage, pageCount, onPage: goPage, total, start, end })));
  }

  function Pager({ page, pageCount, onPage, total, start, end }) {
    if (pageCount <= 1) return null;
    return e("div", { className: "pager" },
      e("span", { className: "pager-info" }, (total === 0 ? 0 : start + 1) + "\u2013" + end + " of " + total),
      e("div", { className: "pager-btns" },
        e("button", { className: "pg", disabled: page <= 1, onClick: () => onPage(page - 1), "aria-label": "Previous page" }, e(Icon, { name: "chevR", size: 14, style: { transform: "rotate(180deg)" } })),
        pageWindow(page, pageCount).map((n, i) => n === "…"
          ? e("span", { key: "gap" + i, className: "pg-gap" }, "…")
          : e("button", { key: n, className: "pg" + (n === page ? " on" : ""), onClick: () => onPage(n) }, n)),
        e("button", { className: "pg", disabled: page >= pageCount, onClick: () => onPage(page + 1), "aria-label": "Next page" }, e(Icon, { name: "chevR", size: 14 }))));
  }

  function RunRow({ r, tz, onClick }) {
    const startSec = DB.runStartSec(r);
    return e("div", { className: "wf-row", style: { gridTemplateColumns: RUN_COLS, minHeight: 56, cursor: "pointer" }, onClick },
      e("div", { className: "wf-name" },
        e("div", { className: "nm", style: { fontSize: 13 } }, wfName(r.wf)),
        e("div", { className: "ds", title: r.id }, r.id)),
      e("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } },
        e(Badge, { status: r.status, noDot: true }),
        (r.status === "succeeded" && r.degraded)
          && e(Badge, { status: "continued", noDot: true }, "continued")),
      e("div", { style: { display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 } },
        e("div", { style: { fontSize: 12.5, color: "var(--tx-mid)" } }, r.trigger),
        e("div", { style: { fontSize: 11.5, color: "var(--tx-lo)" } }, "by " + r.actor)),
      e("div", { className: "mono", style: { display: "flex", alignItems: "center", fontSize: 12, color: "var(--tx-mid)" } }, r.dur),
      e("div", { style: { display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, minWidth: 0 }, title: r.status === "queued" ? "queued" : fmtTimestamp(startSec, tz, { seconds: true }) },
        r.status === "queued"
          ? e("span", { style: { fontSize: 13, color: "var(--tx-lo)" } }, "queued")
          : e("span", { style: { fontSize: 13, color: "var(--tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, fmtAgo(startSec)),
        r.status !== "queued" && e("span", { className: "mono", style: { fontSize: 11, color: "var(--tx-lo)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, fmtTimestamp(startSec, tz))),
      e("div", { style: { display: "flex", alignItems: "center", justifyContent: "flex-end" } }, e(Icon, { name: "chevR", size: 15, style: { color: "var(--tx-lo)" } })));
  }

  // Per-step execution status within a task. Steps run top-to-bottom, so
  // the task's overall status tells us how far through the list we got.
  function stepStatuses(steps, taskStatus, seed) {
    const n = steps.length;
    const fill = (v) => steps.map(() => v);
    if (taskStatus === "queued") return fill("queued");
    if (taskStatus === "skipped") return fill("skipped");
    if (taskStatus === "succeeded") return fill("succeeded");
    if (taskStatus === "failed") {
      const at = n - 1;                          // the last step to run is the one that failed
      return steps.map((_, i) => i < at ? "succeeded" : i === at ? "failed" : "skipped");
    }
    if (taskStatus === "cancelled") {
      const at = n > 1 ? (seed % n) : 0;
      return steps.map((_, i) => i < at ? "succeeded" : i === at ? "cancelled" : "skipped");
    }
    if (taskStatus === "running") {
      const at = Math.min(n - 1, Math.floor(n / 2));
      return steps.map((_, i) => i < at ? "succeeded" : i === at ? "running" : "queued");
    }
    return fill("succeeded");
  }

  // Output of a SINGLE step — its own log, with no `$ bash …` invocation line.
  // running / cancelled stopped partway, so only part of the output exists;
  // queued / skipped steps never ran and produced nothing.
  function stepOutput(sc, st) {
    if (st === "queued" || st === "skipped") return [];
    const partial = st === "running" || st === "cancelled";
    const lines = sc.code.split("\n").filter(l => l.trim() && !l.startsWith("#"));
    const take = partial ? Math.max(1, Math.ceil(lines.length / 2)) : lines.length;
    return lines.slice(0, take).map(l => ({ t: "", m: l.trim().slice(0, 80) }));
  }

  // Effective parameters a task ran with: env defaults overlaid by per-task
  // overrides, then by values entered for this specific run (scoped per task).
  function taskParamsUsed(taskDef, w, runParams) {
    const perTask = (w && w.params && w.params[taskDef.id]) || {};
    const runTask = (runParams && runParams[taskDef.id]) || {};
    return (taskDef.env || []).map(p => {
      const def = p.v != null ? p.v : "";
      const ov = perTask[p.k];
      const runV = runTask[p.k];
      const eff = (runV !== undefined && runV !== "") ? runV
        : (ov !== undefined && ov !== "") ? ov : def;
      return { k: p.k, v: eff, required: !!p.required };
    });
  }

  const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  function RunDetail({ run, ctx }) {
    const w = DB.WF.find(x => x.id === run.wf);
    const tasks = DB.runTasksFor(w, run);
    const stageGroups = (w.stages || []).map(el => Array.isArray(el) ? el.slice() : [el]);
    let __k = 0;
    const stageRows = stageGroups.map(group => group.map(id => ({ idx: __k++, id })));
    const halted = tasks.findIndex(s => s.status === "failed" || s.status === "cancelled" || s.status === "running");
    const [selTaskRaw, setSelTask] = useState(halted >= 0 ? halted : 0);
    const selTask = Math.min(selTaskRaw, tasks.length - 1);

    // map each flattened task index → the stage it belongs to
    const stageOfIdx = {};
    stageRows.forEach((group, si) => group.forEach(({ idx }) => { stageOfIdx[idx] = si; }));

    // ---- skip-current-failures: marks the failed tasks as skipped, which
    // unblocks the run for exactly ONE more stage — the stage right after the
    // one that failed runs to completion; everything further out stays
    // pending (you advance stage by stage, not all at once). ----------------
    const [skippedFailed, setSkippedFailed] = useState(false);
    useEffect(() => { setSkippedFailed(false); }, [run.id]);
    const failedCount = tasks.filter(s => s.status === "failed").length;
    const failStage = tasks.reduce((mx, s, i) => s.status === "failed" ? Math.max(mx, stageOfIdx[i]) : mx, -1);
    const genDur = (i) => { const v = (seedOf(run.id) + i * 2654435761) >>> 0; return `${(v % 4) + 1}m ${String(v % 60).padStart(2, "0")}s`; };
    const effTasks = skippedFailed
      ? tasks.map((s, i) =>
          s.status === "failed"  ? { ...s, status: "skipped",  dur: "\u2014" }
          // resume only the failing stage's remaining siblings and the very
          // next stage; later stages remain queued until the next advance.
          : s.status === "queued" && stageOfIdx[i] <= failStage + 1 ? { ...s, status: "succeeded", dur: genDur(i) }
          : s)
      : tasks;

    const cur = effTasks[selTask];
    const curTaskDef = DB.taskById[cur.id];
    const tolerated = run.status === "succeeded" && (cur.status === "failed" || cur.status === "skipped");
    const isDegraded = run.status === "succeeded" && !!run.degraded;
    // per-run workspace ($WORKSPACE) — where this execution checked out and did its work
    const wsDir = "/Users/dave/data/workspaces/" + run.id;
    // Absolute start time for this run (shared with the executions list), so the
    // per-task timeline below can show real wall-clock start → end times.
    const baseTs = DB.runStartSec(run);
    const tz = ctx.timezone;

    // retry budget for this task: failed/cancelled tasks exhaust it; the odd
    // clean task needed one retry. Total attempts = retriesUsed + 1.
    const retriesAllowed = curTaskDef.retries || 0;
    const retriesUsed = retriesAllowed === 0 ? 0
      : (run.retries && run.retries[selTask] != null) ? Math.min(run.retries[selTask], retriesAllowed)
      : cur.status === "failed" || cur.status === "cancelled" ? retriesAllowed
      : (cur.status === "succeeded" || cur.status === "running") && (seedOf(run.id + cur.id) % 3 === 0) ? 1
      : 0;
    const attempts = retriesUsed + 1;

    // per-step state + which attempt we're inspecting (default: the last one)
    const steps = (curTaskDef.steps || []);
    const [selAttemptRaw, setSelAttempt] = useState(attempts - 1);
    const [selStepRaw, setSelStep] = useState(0);
    // which detail tab is showing — parameters or logs (logs by default)
    const [detailTab, setDetailTab] = useState("meta");
    const selAtt = Math.max(0, Math.min(selAttemptRaw, attempts - 1));
    // when the selected task changes, default to inspecting its last attempt
    useEffect(() => { setSelAttempt(attempts - 1); }, [selTask]);

    // parameters this task ran with (including any entered for this run)
    const params = taskParamsUsed(curTaskDef, w, run.params);

    // ---- task execution timing / limits --------------------------------
    // Derive wall-clock start/end for every task by walking the run from its
    // start (baseTs) and accumulating each task's duration plus a small gap,
    // so the selected task can show real start → end times.
    const parseDur = (d) => { const m = /(\d+)\s*m\s*(\d+)\s*s/.exec(d || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };
    // canonical timestamp — numeric year→seconds order, in UTC, e.g. "2026-06-16 09:31:09".
    // Matches the executions list and the schedule pages for one consistent format.
    const fmtClock = (sec) => fmtTimestamp(sec, tz);
    // compact clock — time of day only, used inside the per-attempt stat strip
    // where the run-level summary above already carries the full date.
    const fmtClockShort = (sec) => fmtClockOnly(sec, tz);
    const fmtSpan = (s) => { if (s == null) return "—"; const m = Math.floor(s / 60), ss = s % 60; return m ? (ss ? m + "m " + String(ss).padStart(2, "0") + "s" : m + "m") : ss + "s"; };
    const TASK_GAP = 4;
    let __acc = baseTs;
    const taskTimes = effTasks.map(s => {
      if (s.status === "queued" || s.status === "skipped") return { start: null, end: null };
      const start = __acc;
      if (s.status === "running") return { start, end: null };
      const d = parseDur(s.dur) || 0;
      const end = start + d;
      __acc = end + TASK_GAP;
      return { start, end };
    });
    const curTime = taskTimes[selTask] || { start: null, end: null };
    const timeoutSecs = curTaskDef.timeout || 0;
    const durSecs = parseDur(cur.dur);

    // ---- per-attempt breakdown -----------------------------------------
    // Lay each attempt out sequentially from the task's start: earlier
    // attempts failed (that's why it retried) and the last attempt carries the
    // task's recorded outcome + duration. A backoff gap sits between them.
    const BACKOFF = 6;
    const attemptDur = (i) => {
      if (i === attempts - 1) return durSecs;          // final = the task's duration
      const v = seedOf(run.id + cur.id + "ad" + i);    // earlier failed attempt
      let d = 25 + (v % 121);                           // 25s–145s
      if (timeoutSecs > 0) d = Math.min(d, timeoutSecs);
      return d;
    };
    let __aacc = curTime.start;
    const attemptList = Array.from({ length: attempts }, (_, i) => {
      const status = i === attempts - 1 ? cur.status : "failed";
      if (__aacc == null || cur.status === "queued" || cur.status === "skipped") return { status, start: null, end: null, dur: null };
      const start = __aacc;
      if (status === "running") return { status, start, end: null, dur: null };
      const d = attemptDur(i);
      if (d == null) return { status, start, end: null, dur: null };
      const end = start + d;
      __aacc = end + BACKOFF;
      return { status, start, end, dur: d };
    });
    const att = attemptList[selAtt] || { status: cur.status, start: curTime.start, end: curTime.end, dur: durSecs };

    // per-step state derives from the SELECTED attempt's outcome + its own
    // seed, so each attempt shows a distinct step breakdown and log output.
    const scStatuses = stepStatuses(steps, att.status, seedOf(run.id + cur.id + "a" + selAtt));
    useEffect(() => {
      const fail = scStatuses.findIndex(s => s === "failed" || s === "cancelled" || s === "running");
      setSelStep(fail >= 0 ? fail : 0);
    }, [selTask, selAtt]);
    const selStep = selStepRaw >= steps.length ? steps.length - 1 : selStepRaw;
    const logBase = att.start != null ? att.start : baseTs;

    // duration vs. timeout health (warn when we burned >80% of the budget)
    const nearTimeout = att.dur != null && timeoutSecs > 0 && att.dur >= timeoutSecs * 0.8;
    const metaCells = [
      { label: "Version", value: "v" + (curTaskDef.version || 1), mono: true },
      { label: "Start", value: att.start != null ? fmtClock(att.start) : "—", mono: true },
      { label: "End", value: att.status === "running" ? "—" : att.end != null ? fmtClock(att.end) : "—", mono: true },
      { label: "Duration", value: att.status === "running" ? "—" : att.dur != null ? fmtSpan(att.dur) : "—", mono: true, tone: nearTimeout ? "warn" : null },
      { label: "Timeout", value: timeoutSecs ? fmtSpan(timeoutSecs) : "none", mono: true },
      { label: "Auto retries", value: retriesAllowed === 0 ? "none" : ((retriesUsed != null ? retriesUsed : selAtt) + " / " + retriesAllowed), mono: true },
    ];

    // ---- workflow (run-level) execution summary ------------------------
    // The run as a whole: which workflow version ran, wall-clock start/finish,
    // total duration, and how many stages came through clean.
    const runDurSecs = parseDur(run.dur);
    const runEnd = (run.status === "running" || run.status === "queued") ? null
      : runDurSecs != null ? baseTs + runDurSecs : null;
    const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    // stampZ appends the display-zone tag so a lone timestamp (no column header
    // to carry it) is unambiguous.
    const stampZ = (sec) => sec != null ? fmtClock(sec) + " " + tzShort(tz) : "—";
    const wfCells = [
      { label: "Version", value: "v" + (w.version || 1), mono: true, title: "Workflow version used by this execution" },
      { label: "Started", value: run.status === "queued" ? "queued" : stampZ(baseTs), mono: true },
      { label: "Finished", value: run.status === "running" ? "in progress" : stampZ(runEnd), mono: true, tone: run.status === "running" ? "run" : null },
      { label: "Duration", value: run.dur, mono: true },
      { label: "Trigger", value: cap(run.trigger) + " · " + run.actor },
    ];

    return e(React.Fragment, null,
      // page header — consistent with every other page in the app
      e("div", { className: "ph" },
        e("div", { style: { minWidth: 0 } },
          e("div", { style: { display: "flex", alignItems: "center", gap: 11, marginBottom: 5, flexWrap: "wrap" } },
            e("h1", { style: { margin: 0 } }, wfName(run.wf)),
            run.status === "running"
              ? e(Badge, { status: "running", pulse: true })
              : isDegraded
              ? e("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
                  e(Badge, { status: run.status, noDot: true }),
                  e(Badge, { status: "continued", noDot: true }, "continued"))
              : e(Badge, { status: run.status, noDot: true })),
          e("p", { className: "mono", style: { fontSize: 12.5 } }, run.id)),
        e("div", { className: "ph-actions" },
          run.status !== "queued" && e(Btn, { variant: "ghost", icon: "folder", title: "Reveal workspace in Finder \u2014 " + wsDir, onClick: () => ctx.toast && ctx.toast("Opening workspace in Finder") }, "Workspace"),
          (run.status === "running" || run.status === "queued")
            ? e(Btn, { variant: "danger", icon: "x", onClick: () => ctx.confirm && ctx.confirm({
                icon: "x", title: "Cancel execution",
                message: e(React.Fragment, null, "Cancel this run of ", e("b", null, wfName(run.wf)), "? Any tasks still running are stopped and the run can't be resumed \u2014 you'd need to re-run it."),
                confirmLabel: "Cancel execution", cancelLabel: "Keep running", onConfirm: () => ctx.toast && ctx.toast("Cancelling run " + run.id) }) }, "Cancel")
            : e(Btn, { variant: "ghost", icon: "sync", onClick: () => ctx.nav({ view: "prepare", workflowId: w.id, prefill: { params: run.params || {}, taskParams: run.params || {}, fromRun: run.id, version: w.version || 1 } }) }, "Re-run"))),

      // workflow-level execution summary — clean stat strip
      e("div", { className: "card run-summary" },
        e("div", { className: "meta-grid" },
          wfCells.map(c => e("div", { key: c.label, className: "meta-cell", title: c.title || undefined },
            e("span", { className: "meta-k" }, c.label),
            e("span", { className: "meta-v" + (c.mono ? " mono" : "") + (c.tone ? " t-" + c.tone : "") }, c.value))))),

      // stages + detail
      e("div", { className: "section-title", style: { margin: "24px 0 12px" } }, stageRows.length + " stages · " + tasks.length + " tasks"),
      e("div", { className: "run-grid" },
        // stage + task rail
        e("div", { className: "card run-rail-card" },
          e("div", { className: "run-rail" },
            stageRows.map((group, si) => e("div", { key: si, style: { marginBottom: si < stageRows.length - 1 ? 10 : 0 } },
              e("div", { className: "stage-tag", style: { justifyContent: "flex-start", margin: "0 0 5px", padding: "0 4px" } },
                "Stage " + (si + 1)),
              group.map(({ idx, id }) => {
                const s = effTasks[idx];
                // a stage that failed but was tolerated (run succeeded overall) is "continued" — orange dot
                const dotStatus = (run.status === "succeeded" && s.status === "failed") ? "continued" : s.status;
                return e("div", { key: idx, className: "run-task" + (idx === selTask ? " on" : ""), onClick: () => setSelTask(idx) },
                  e(Dot, { status: dotStatus, pulse: s.status === "running" }),
                  e("span", { className: "rs-nm" }, s.name),
                  s.status === "succeeded"
                    ? e("span", { className: "rs-dur" }, s.dur)
                    : s.status === "skipped"
                    ? e("span", { className: "rs-skipped" }, "Skipped")
                    : null);
              }))))),
          // right column: one unified task panel — header, attempt switcher,
          // a combined details zone (timing + parameters), then logs on top.
          e("div", { className: "run-detail-col" },
           e("div", { className: "task-panel" },
            // unified header — task identity + overall status
            e("div", { className: "tp-head" },
              e("span", { className: "tp-name" }, cur.name),
              cur.status === "running"
                ? e(Badge, { status: "running", pulse: true })
                : cur.status === "queued"
                ? e(Badge, { status: "queued", noDot: true })
                : cur.status === "skipped"
                ? e(Badge, { status: "skipped", noDot: true })
                : cur.status === "cancelled"
                ? e(Badge, { status: "cancelled", noDot: true })
                : e(React.Fragment, null,
                    e(Badge, { status: cur.status, noDot: true }),
                    tolerated && cur.status === "failed" && e(Badge, { status: "continued", noDot: true }, "continued")),
              e("span", { className: "spacer" }),
              // task-scoped controls — recovery happens per-task, never on a
              // succeeded run (nothing left to act on).
              run.status !== "succeeded" && e("div", { style: { display: "flex", gap: 8 } },
                cur.status === "running" && e(Btn, { size: "sm", variant: "danger", icon: "x", onClick: () => ctx.confirm && ctx.confirm({
                  icon: "x", tone: "warn", title: "Cancel task",
                  message: e(React.Fragment, null, "Stop ", e("b", null, cur.name), "? The task is interrupted \u2014 you can retry it afterward."),
                  confirmLabel: "Cancel task", cancelLabel: "Keep running", onConfirm: () => ctx.toast && ctx.toast("Cancelling " + cur.name) }) }, "Cancel"),
                (run.status === "failed" || run.status === "cancelled") && (cur.status === "failed" || cur.status === "cancelled") && e(React.Fragment, null,
                  e(Btn, { size: "sm", variant: "ghost", icon: "skip", onClick: () => ctx.confirm && ctx.confirm({
                    icon: "skip", tone: "warn", title: "Skip task",
                    message: e(React.Fragment, null, "Skip ", e("b", null, cur.name), " and unblock the next stage? This task is marked skipped and the run advances."),
                    confirmLabel: "Skip task", cancelLabel: "Cancel", onConfirm: () => { setSkippedFailed(true); ctx.toast && ctx.toast("Skipped " + cur.name); } }) }, "Skip"),
                  e(Btn, { size: "sm", variant: "primary", icon: "sync", onClick: () => ctx.toast && ctx.toast("Retrying " + cur.name) }, "Retry")),
                (run.status === "failed" || run.status === "cancelled") && cur.status === "queued" && e(Btn, { size: "sm", variant: "ghost", icon: "skip", onClick: () => ctx.confirm && ctx.confirm({
                  icon: "skip", tone: "warn", title: "Skip task",
                  message: e(React.Fragment, null, "Skip ", e("b", null, cur.name), "? This task is marked skipped."),
                  confirmLabel: "Skip task", cancelLabel: "Cancel", onConfirm: () => { setSkippedFailed(true); ctx.toast && ctx.toast("Skipped " + cur.name); } }) }, "Skip"))),
            // attempt switcher — always shown (single attempt renders one tab)
            e("div", { className: "attempt-tabs", role: "tablist" },
              attemptList.map((a, i) => e("button", { key: i, role: "tab", "aria-selected": i === selAtt, className: "attempt-tab" + (i === selAtt ? " on" : ""), onClick: () => setSelAttempt(i), title: "Attempt " + (i + 1) + " — " + a.status },
                e(Dot, { status: a.status }),
                e("span", { className: "at-n" }, "Attempt " + (i + 1)),
                a.dur != null
                  ? e("span", { className: "at-dur" }, fmtSpan(a.dur))
                  : a.status === "running"
                  ? e("span", { className: "at-dur t-run" }, "running")
                  : null))),
            // metadata / parameters / logs tab strip
            e("div", { className: "tp-tabs", role: "tablist" },
              e("button", { role: "tab", "aria-selected": detailTab === "meta", className: "tp-tab" + (detailTab === "meta" ? " on" : ""), onClick: () => setDetailTab("meta") },
                e(Icon, { name: "info", size: 12 }),
                e("span", null, "Info")),
              e("button", { role: "tab", "aria-selected": detailTab === "logs", className: "tp-tab" + (detailTab === "logs" ? " on" : ""), onClick: () => setDetailTab("logs") },
                e(Icon, { name: "terminal", size: 12 }),
                e("span", null, "Logs")),
              e("button", { role: "tab", "aria-selected": detailTab === "params", className: "tp-tab" + (detailTab === "params" ? " on" : ""), onClick: () => setDetailTab("params") },
                e(Icon, { name: "sliders", size: 12 }),
                e("span", null, "Parameters"),
                params.length ? e("span", { className: "tp-tab-count" }, params.length) : null),
              e("span", { className: "spacer" }),
              detailTab === "logs" && attempts > 1 && e("span", { className: "term-attempt" }, "Attempt " + (selAtt + 1) + " / " + attempts)),
            // metadata tab body — timing/limits, styled like the parameters list
            detailTab === "meta" && e("div", { className: "tp-params" },
              metaCells.map(c => e("div", { key: c.label, className: "rp-row", title: c.title || undefined },
                e("span", { className: "rp-k", title: c.label }, c.label),
                e("span", { className: "rp-v" + (c.tone ? " t-" + c.tone : ""), title: String(c.value) }, c.value)))),
            // parameters tab body
            detailTab === "params" && e("div", { className: "tp-params" },
              params.length
                ? params.map(p => e("div", { key: p.k, className: "rp-row" },
                    e("span", { className: "rp-k", title: p.k }, p.k),
                    e("span", { className: "rp-v", title: String(p.v) }, p.v === "" ? "" : p.v)))
                : e("div", { className: "tp-params-empty" }, "This task takes no parameters.")),
            // logs tab body — the dominant section
            detailTab === "logs" && e("div", { className: "tp-logs" },
              e("div", { className: "step-logs" },
                steps.length === 0
                  ? e("div", { className: "log-ln dim", style: { padding: "12px 14px" } }, e("span", { className: "msg" }, "// no steps"))
                  : steps.map((sc, i) => {
                      const open = i === selStep;
                      const st = scStatuses[i];
                      const slog = stepOutput(sc, st);
                      return e("div", { key: i, className: "step-log" + (open ? " open" : "") },
                        e("button", { className: "sl-head", onClick: () => setSelStep(open ? -1 : i), title: sc.desc || sc.name },
                          e(Icon, { name: "chevD", size: 14, style: { transition: "transform .15s", transform: open ? "rotate(180deg)" : "none", color: "var(--tx-lo)", flex: "none" } }),
                          e(Dot, { status: st, pulse: st === "running" }),
                          e("span", { className: "sl-name" }, sc.name),
                          e("span", { className: "sl-status" }, st)),
                        open && e("div", { className: "term-body" },
                          slog.length === 0
                            ? e("div", { className: "log-ln dim" }, e("span", { className: "msg" }, "// " + sc.name + " — " + ((st === "skipped" || st === "queued") ? "did not run" : "no output")))
                            : slog.map((l, i2) => {
                                const tt = fmtClockOnly(logBase + i2, tz);
                                return e("div", { key: i2, className: "log-ln " + (l.t || "") },
                                  e("span", { className: "ts" }, tt), e("span", { className: "msg" }, l.m));
                              })));
                    })))))));
  }

  function RunDetailPage({ ctx }) {
    const run = DB.RUNS.find(r => r.id === ctx.state.runId);
    if (!run) return e("div", { className: "page page-wide fadein" },
      e("div", { className: "empty", style: { padding: "60px 0" } }, "Execution not found."));
    return e("div", { className: "page page-wide fadein" },
      e(RunDetail, { run, ctx }));
  }

  window.Views = window.Views || {};
  Object.assign(window.Views, { RunsView, RunDetailPage });
  // Shared execution-list primitives so other views (e.g. the workflow page)
  // render the exact same row / pager / columns.
  window.RunsUI = { RunRow, Pager, RUN_COLS, PAGE_SIZE };
})();
