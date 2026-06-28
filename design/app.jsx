/* ============================================================
   App shell: sidebar + topbar + routing + global state
   ============================================================ */
(function () {
  "use strict";
  const { e, Icon, ConfirmModal } = window.UI;
  const { useState, useEffect, useCallback, useRef } = React;
  const DB = window.DB;
  const V = window.Views;

  function keyFor(st) { return st.view + "|" + (st.workflowId || "") + "|" + (st.runId || "") + "|" + (st.taskId || ""); }

  const NAV_GROUPS = [
    {
      label: "Orchestration",
      items: [
        { id: "workflows", label: "Workflows", icon: "workflows" },
        { id: "tasks", label: "Tasks", icon: "tasks" },
        { id: "runs", label: "Executions", icon: "history" },
      ],
    },
    {
      foot: true,
      items: [
        { id: "settings", label: "Settings", icon: "settings" },
      ],
    },
  ];

  // Panel-left glyph for the collapse toggle (FA Free lacks a sidebar icon).
  function PanelIcon({ size = 16 }) {
    return e("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
      e("rect", { x: 1.6, y: 2.6, width: 12.8, height: 10.8, rx: 2.4, stroke: "currentColor", strokeWidth: 1.4 }),
      e("line", { x1: 6.1, y1: 3, x2: 6.1, y2: 13, stroke: "currentColor", strokeWidth: 1.4 }));
  }

  // Square ghost icon-button used for the nav collapse / expand toggle.
  function NavToggle({ collapsed, onClick }) {
    return e("button", {
      className: "nav-toggle",
      onClick,
      title: collapsed ? "Expand sidebar" : "Collapse sidebar",
      "aria-label": collapsed ? "Expand sidebar" : "Collapse sidebar",
    }, e(PanelIcon, { size: 16 }));
  }

  function App() {
    const [state, setState] = useState({ view: "workflows", workflowId: null, runId: null, __idx: 0 });
    const [workflows, setWorkflows] = useState(() => DB.WF.map(w => ({ ...w, triggers: DB.triggersFor(w) })));
    const [tasks, setTasks] = useState(() => DB.TASKS.map(s => ({ ...s })));
    const [toastMsg, setToastMsg] = useState(null);
    const [confirm, setConfirm] = useState(null); // {title, message, ...ConfirmModal props}
    // Display time zone for all schedules + timestamps (Settings → General).
    // Stored as a real IANA zone name ("America/Los_Angeles", "Europe/London",
    // "UTC", …) and persisted per user. Defaults to the browser's own zone.
    const [timezone, setTimezoneRaw] = useState(() => {
      const isIana = (v) => {
        if (!v) return false;
        try { new Intl.DateTimeFormat("en-US", { timeZone: v }); return true; }
        catch (e) { return false; }
      };
      let stored;
      try { stored = localStorage.getItem("ad_timezone"); } catch (e) {}
      if (isIana(stored)) return stored;          // valid IANA name → keep
      // legacy "UTC±00:00 · London" values (or none) → adopt the system zone
      let sys;
      try { sys = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
      return isIana(sys) ? sys : "UTC";
    });
    const setTimezone = useCallback((tz) => {
      setTimezoneRaw(tz);
      try { localStorage.setItem("ad_timezone", tz); } catch (e) {}
    }, []);

    // Left-nav collapse (Claude-desktop style): the rail slides away and a
    // toggle in the topbar brings it back. Persisted across sessions.
    const [navCollapsed, setNavCollapsed] = useState(() => {
      try { return localStorage.getItem("ad_nav_collapsed") === "1"; } catch (e) { return false; }
    });
    const toggleNav = useCallback(() => {
      setNavCollapsed(c => {
        const n = !c;
        try { localStorage.setItem("ad_nav_collapsed", n ? "1" : "0"); } catch (e) {}
        return n;
      });
    }, []);

    // remembered scroll position per visited view, so going back restores it
    const scrollMap = useRef({});
    const pendingTop = useRef(null);
    const pendingReset = useRef(null);  // top-level nav reset target, applied after unwinding history
    const stateRef = useRef(state);
    stateRef.current = state;

    const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(t => t === m ? null : t), 2400); }, []);
    const nav = useCallback((s) => {
      // remember where we were on the page we're leaving
      const c = document.querySelector(".content");
      if (c) scrollMap.current[keyFor(stateRef.current)] = c.scrollTop;
      const next = { view: "workflows", workflowId: null, runId: null, taskId: null, ...s };
      next.__idx = (stateRef.current.__idx || 0) + 1;
      // restore saved position for the destination (0 = top, for never-visited pages)
      pendingTop.current = scrollMap.current[keyFor(next)] || 0;
      window.history.pushState(next, "");
      setState(next);
    }, []);

    // Top-level sidebar nav: clear the back stack and start fresh at this view.
    // The History API can't delete entries, so we unwind to the base entry with
    // go(-depth) and replace it (in the popstate handler) with the target view —
    // afterwards the back stack holds only this page.
    const navRoot = useCallback((s) => {
      const c = document.querySelector(".content");
      if (c) scrollMap.current[keyFor(stateRef.current)] = c.scrollTop;
      const next = { view: "workflows", workflowId: null, runId: null, taskId: null, ...s, __idx: 0 };
      const depth = stateRef.current.__idx || 0;
      if (depth > 0) {
        pendingReset.current = next;      // applied when go(-depth) lands on the base entry
        window.history.go(-depth);
      } else {
        pendingTop.current = 0;
        window.history.replaceState(next, "");
        setState(next);
      }
    }, []);

    // apply the remembered scroll position after the destination view has rendered.
    // retries across a few frames so lists that grow after mount (pagination,
    // async data) can still reach the saved offset before it's clamped.
    useEffect(() => {
      const target = pendingTop.current || 0;
      pendingTop.current = null;
      let tries = 0;
      const apply = () => {
        const c = document.querySelector(".content");
        if (!c) return;
        c.scrollTop = target;
        if (target > 0 && c.scrollTop < target - 1 && tries < 8) {
          tries++; requestAnimationFrame(apply);
        }
      };
      apply();
    }, [state]);

    const ctx = {
      state, nav, navRoot, workflows, tasks, toast, timezone, setTimezone,
      // existing tasks open a read-only detail page; a brand-new task goes straight to the editor
      openTask: (id) => nav(id === "__new" ? { view: "taskEdit", taskId: id } : { view: "task", taskId: id }),
      editTask: (id) => nav({ view: "taskEdit", taskId: id }),
      // Cancel from the editor: existing tasks return to their detail page, a new one to the library
      closeTask: () => { const id = stateRef.current.taskId; nav(id && id !== "__new" ? { view: "task", taskId: id } : { view: "tasks" }); },
      saveTask: (draft) => {
        if (draft.id === "__new") {
          const id = "tk_" + draft.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
          const created = { ...draft, id, version: 1, savedAt: "just now", history: [] };
          setTasks(s => [...s, created]);
          DB.taskById[id] = created;
          toast("Task created: " + draft.name);
          // return to wherever the editor was opened from
          window.history.back();
          return;
        } else {
          const prev = DB.taskById[draft.id];
          const version = (prev.version || 1) + 1;
          const history = (prev.history || []).concat([DB.snapTask(prev)]);
          // strip transient version fields off the incoming draft, then re-stamp
          const { version: _v, history: _h, savedAt: _s, ...fields } = draft;
          const updated = { ...prev, ...fields, version, history, savedAt: "just now" };
          setTasks(s => s.map(x => x.id === draft.id ? updated : x));
          DB.taskById[draft.id] = updated;
          toast("Saved " + draft.name);
        }
        // return to wherever the editor was opened from
        window.history.back();
      },
      // Delete a task — only meaningful when nothing references it. The UI gates
      // the action on zero usage; this guards it again so a stale click can't
      // orphan a task that a workflow still depends on.
      deleteTask: (id) => {
        const usedBy = workflows.filter(w => w.stages.flat().includes(id)).length;
        const x = DB.taskById[id] || tasks.find(s => s.id === id);
        if (usedBy > 0) { toast("Can't delete — used by " + usedBy + (usedBy === 1 ? " workflow" : " workflows")); return; }
        setTasks(s => s.filter(t => t.id !== id));
        delete DB.taskById[id];
        toast("Deleted " + (x ? x.name : "task"));
        nav({ view: "tasks" });
      },
      openSchedule: (w) => nav({ view: "schedule", workflowId: w.id }),
      saveTriggers: (w, triggers) => {
        const firstCron = triggers.find(t => t.type === "cron" && t.enabled);
        const schedule = firstCron
          ? { type: "cron", cron: firstCron.cron, next: "in 6h" }
          : { type: "manual", cron: null, next: null };
        setWorkflows(ws => ws.map(x => x.id === w.id ? { ...x, triggers, schedule } : x));
        nav({ view: "workflow", workflowId: w.id });
        toast("Triggers updated for " + w.name);
      },
      editWorkflow: (w, editTab) => nav({ view: "workflowEdit", workflowId: w.id, editTab: editTab || null }),
      newWorkflow: () => nav({ view: "workflowEdit", workflowId: "__new" }),
      // launch a fresh run from the prepare page: build a "running" execution,
      // stash it at the top of the history, and open the execution page.
      launchRun: (w, params) => {
        const n = Math.max(1, ((w && w.stages) || []).flat().length);
        const hx = (k) => Array.from({ length: k }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
        const id = `${hx(8)}-${hx(4)}-4${hx(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hx(3)}-${hx(12)}`;
        const run = {
          id, wf: w.id, trigger: "manual", actor: "you", started: "just now",
          dur: "\u2014", status: "running",
          stopAt: Math.min(n - 1, Math.max(1, Math.floor(n / 2))),
          params: params || {},
        };
        DB.RUNS.unshift(run);
        toast("Started " + w.name);
        nav({ view: "run", runId: id, workflowId: w.id });
      },
      createWorkflow: (draft) => {
        const base = (draft.name || "").trim() || "untitled-workflow";
        let id = "wf_" + base.replace(/[^a-z0-9]/gi, "_").toLowerCase().replace(/^_+|_+$/g, "");
        if (!id || id === "wf_") id = "wf_workflow";
        if (workflows.some(v => v.id === id)) id = id + "_" + Math.random().toString(36).slice(2, 6);
        const triggers = (draft.triggers || []).map(t => ({ ...t }));
        const firstCron = triggers.find(t => t.type === "cron" && t.enabled);
        const schedule = firstCron ? { type: "cron", cron: firstCron.cron, next: "in 6h" } : { type: "manual", cron: null, next: null };
        const created = {
          id, name: base, desc: draft.desc || "",
          wfParams: draft.wfParams || {}, params: draft.params || {}, exec: draft.exec || {},
          triggers, schedule,
          stages: (draft.stages || []).filter(s => s.length > 0).map(s => s.slice()),
          lastRun: "never", lastStatus: "skip",
          version: 1, savedAt: "just now", verHistory: [],
        };
        setWorkflows(ws => [created, ...ws]);
        toast("Created " + created.name);
        // return to wherever the editor was opened from
        window.history.back();
      },
      saveWorkflow: (draft) => {
        const prev = workflows.find(v => v.id === draft.id);
        const nextVer = ((prev && prev.version) || 1) + 1;
        setWorkflows(ws => ws.map(x => {
          if (x.id !== draft.id) return x;
          const verHistory = (x.verHistory || []).concat([DB.snapWorkflow(x)]);
          const { version: _v, verHistory: _vh, savedAt: _s, ...fields } = draft;
          return { ...x, ...fields, version: (x.version || 1) + 1, verHistory, savedAt: "just now" };
        }));
        toast("Saved " + draft.name);
        // return to wherever the editor was opened from (workflow detail, list, schedule…)
        window.history.back();
      },
      deleteWorkflow: (id) => {
        const x = workflows.find(v => v.id === id);
        setWorkflows(ws => ws.filter(v => v.id !== id));
        toast("Deleted " + (x ? x.name : "workflow"));
        nav({ view: "workflows" });
      },
      // generic destructive-action confirmation — opts: {icon,tone,title,message,confirmLabel,onConfirm}
      confirm: (opts) => setConfirm(opts),
    };

    // browser back/forward → restore the previous view
    useEffect(() => {
      window.history.replaceState({ view: "workflows", workflowId: null, runId: null, taskId: null, __idx: 0 }, "");
      const onPop = (ev) => {
        // save the page we're leaving, then restore the one we're returning to
        const c = document.querySelector(".content");
        if (c) scrollMap.current[keyFor(stateRef.current)] = c.scrollTop;
        // Finishing a top-level nav reset: we've unwound to the base entry — replace
        // it with the target view so the back stack holds only this page.
        if (pendingReset.current) {
          const t = pendingReset.current;
          pendingReset.current = null;
          window.history.replaceState(t, "");
          pendingTop.current = 0;
          setState(t);
          return;
        }
        const st = ev.state || { view: "workflows", workflowId: null, runId: null, taskId: null, __idx: 0 };
        pendingTop.current = scrollMap.current[keyFor(st)] || 0;
        setState(st);
      };
      window.addEventListener("popstate", onPop);
      return () => window.removeEventListener("popstate", onPop);
    }, []);

    // macOS two-finger swipe back/forward. Inside an embedded preview the native
    // edge-swipe gesture drives the *outer* browser, never this iframe's history —
    // so we read the horizontal trackpad delta off wheel events and drive history
    // ourselves.
    useEffect(() => {
      let acc = 0;          // accumulated horizontal intent (px)
      let dir = 0;          // locked axis: -1 back (swipe right), +1 fwd (swipe left)
      let active = false;   // a horizontal gesture is in progress
      let fired = false;    // already committed this gesture
      let idle = null;      // timer that ends the gesture after the wheel stalls
      const COMMIT = 110;   // px of sustained horizontal travel to navigate

      const reset = () => { active = false; fired = false; acc = 0; dir = 0; };

      const onWheel = (ev) => {
        const ax = Math.abs(ev.deltaX), ay = Math.abs(ev.deltaY);
        // only horizontally-dominant motion counts as a navigation swipe
        if (!active && (ax <= ay * 1.4 || ax < 1.5)) return;
        // if the element actually scrolls horizontally, let it scroll instead
        if (!active) {
          let n = ev.target;
          while (n && n !== document.body) {
            if (n.scrollWidth > n.clientWidth + 2) {
              const cs = getComputedStyle(n).overflowX;
              if (cs === "auto" || cs === "scroll") return;
            }
            n = n.parentElement;
          }
          active = true; dir = ev.deltaX < 0 ? -1 : 1;
        }
        if (ev.cancelable) ev.preventDefault();
        // ignore deltas that reverse the locked direction (gesture wobble)
        if (Math.sign(ev.deltaX) === Math.sign(dir) || acc === 0) acc += ev.deltaX;
        // dir: deltaX negative (content pushed right) == swipe-right == go back
        dir = acc < 0 ? -1 : 1;
        if (!fired && Math.abs(acc) >= COMMIT) {
          fired = true;
          if (dir < 0) window.history.back(); else window.history.forward();
        }
        clearTimeout(idle);
        idle = setTimeout(reset, 90);
      };
      window.addEventListener("wheel", onWheel, { passive: false });
      return () => { window.removeEventListener("wheel", onWheel); clearTimeout(idle); };
    }, []);

    // breadcrumbs
    const wf = workflows.find(w => w.id === state.workflowId);
    const crumbs = [];
    if (state.view === "task" || state.view === "taskEdit") {
      const isNew = state.taskId === "__new";
      const st = isNew ? null : (DB.taskById[state.taskId] || tasks.find(s => s.id === state.taskId));
      crumbs.push({ label: "Tasks", to: { view: "tasks" }, link: true });
      if (state.view === "taskEdit") {
        if (isNew) crumbs.push({ label: "New task", cur: true });
        else {
          crumbs.push({ label: st ? st.name : "Task", to: { view: "task", taskId: state.taskId }, link: true, mono: true });
          crumbs.push({ label: "Edit", cur: true });
        }
      } else {
        crumbs.push({ label: st ? st.name : "Task", cur: true, mono: true });
      }
    } else if (state.view === "workflowEdit") {
      crumbs.push({ label: "Workflows", to: { view: "workflows" }, link: true });
      if (state.workflowId === "__new") {
        crumbs.push({ label: "New workflow", cur: true });
      } else {
        if (wf) crumbs.push({ label: wf.name, to: { view: "workflow", workflowId: wf.id }, link: true, mono: true });
        crumbs.push({ label: "Edit", cur: true });
      }
    } else if (state.view === "schedule") {
      crumbs.push({ label: "Workflows", to: { view: "workflows" }, link: true });
      if (wf) crumbs.push({ label: wf.name, to: { view: "workflow", workflowId: wf.id }, link: true, mono: true });
      crumbs.push({ label: "Triggers", cur: true });
    } else if (state.view === "run") {
      crumbs.push({ label: "Executions", to: { view: "runs", workflowId: state.workflowId || null }, link: true });
      crumbs.push({ label: state.runId || "Execution", cur: true, mono: true });
    } else if (state.view === "prepare") {
      crumbs.push({ label: "Workflows", to: { view: "workflows" }, link: true });
      if (wf) crumbs.push({ label: wf.name, to: { view: "workflow", workflowId: wf.id }, link: true, mono: true });
      crumbs.push({ label: "Run", cur: true });
    } else {
      const titles = { workflows: "Workflows", tasks: "Tasks", runs: "Executions", settings: "Settings", workflow: "Workflows" };
      if (state.view === "workflow" && wf) {
        crumbs.push({ label: "Workflows", to: { view: "workflows" }, link: true });
        crumbs.push({ label: wf.name, cur: true, mono: true });
      } else if (state.view === "runs" && wf) {
        crumbs.push({ label: "Executions", to: { view: "runs" }, link: true });
        crumbs.push({ label: wf.name, cur: true, mono: true });
      } else {
        crumbs.push({ label: titles[state.view] || cap(state.view), cur: true });
      }
    }

    let page;
    if (state.view === "workflows") page = e(V.WorkflowsList, { ctx });
    else if (state.view === "workflow") page = e(V.WorkflowDetail, { ctx });
    else if (state.view === "workflowEdit") page = e(V.WorkflowEdit, { ctx });
    else if (state.view === "tasks") page = e(V.TasksLibrary, { ctx });
    else if (state.view === "task") page = e(window.TaskDetail, { ctx });
    else if (state.view === "taskEdit") page = e(window.TaskEditor, { ctx });
    else if (state.view === "runs") page = e(V.RunsView, { ctx });
    else if (state.view === "run") page = e(V.RunDetailPage, { ctx });
    else if (state.view === "prepare") page = e(V.RunPrepare, { ctx });
    else if (state.view === "settings") page = e(V.SettingsView, { ctx });
    else if (state.view === "schedule") page = e(V.TriggersEditor, { ctx });
    else page = e("div", { className: "page" }, "—");

    const activeNav = (state.view === "workflow" || state.view === "workflowEdit" || state.view === "prepare" || state.view === "schedule") ? "workflows" : (state.view === "task" || state.view === "taskEdit") ? "tasks" : state.view === "run" ? "runs" : state.view;

    return e("div", { className: "app" + (navCollapsed ? " nav-collapsed" : "") },
      // sidebar
      e("aside", { className: "sidebar" },
        e("div", { className: "brand" },
          e("div", { className: "brand-mark" }, e(Icon, { name: "hammer", size: 16 })),
          e("div", { className: "brand-name" }, "Worker ", e("b", null, "Forge")),
          e(NavToggle, { collapsed: false, onClick: toggleNav })),
        e("nav", { className: "nav", style: { flex: 1 } },
          NAV_GROUPS.map((g, gi) => e("div", { key: gi, className: "nav-group", style: g.foot ? { marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--line-soft)" } : null },
            g.label && e("div", { className: "nav-label" }, g.label),
            g.items.map(n => e("button", { key: n.id, className: "nav-item" + (activeNav === n.id ? " active" : ""), onClick: () => navRoot({ view: n.id }) },
              e(Icon, { name: n.icon, size: 17 }), n.label,
              n.id === "workflows" && e("span", { className: "count" }, workflows.length),
              n.id === "tasks" && e("span", { className: "count" }, tasks.length))))))),

      // main
      e("main", { className: "main" },
        e("div", { className: "topbar" },
          navCollapsed && e(NavToggle, { collapsed: true, onClick: toggleNav }),
          e("div", { className: "crumbs" },
            crumbs.map((c, i) => [
              i > 0 && e("span", { key: "s" + i, className: "sep" }, "/"),
              e("span", { key: i, className: "c " + (c.link ? "link " : "") + (c.cur ? "cur " : "") + (c.mono ? "mono" : ""), onClick: () => c.to && nav(c.to) }, c.label)]))),
        e("div", { className: "content" }, page)),

      // overlays
      confirm && e(ConfirmModal, { ...confirm,
        onClose: () => setConfirm(null),
        onConfirm: () => { const fn = confirm.onConfirm; setConfirm(null); fn && fn(); } }),
      toastMsg && e("div", { className: "toast" }, e(Icon, { name: "check", size: 15, style: { color: "var(--accent)" } }), toastMsg));
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  ReactDOM.createRoot(document.getElementById("root")).render(e(App));
})();
