/* ============================================================
   App shell: sidebar + topbar + routing + global state.
   ctx actions call the API via the model.
   ============================================================ */
import React from 'react'
import { e, Icon, ConfirmModal } from './ui'
import { DB, subscribe, getRevision, loadAll, actions } from './model'
import { WorkflowsList, WorkflowDetail, WorkflowEdit, RunPrepare } from './views/workflows'
import { TasksLibrary, TaskDetail, TaskEditor } from './views/tasks'
import { RunsView, RunDetailPage } from './views/runs'
import { TriggersEditor } from './views/triggers'
import { SettingsView } from './views/settings'

const { useState, useEffect, useCallback, useRef, useSyncExternalStore } = React

function keyFor(st) { return st.view + '|' + (st.workflowId || '') + '|' + (st.runId || '') + '|' + (st.taskId || '') }

// Panel-left glyph for the collapse toggle (FA Free lacks a sidebar icon).
function PanelIcon({ size = 16 }) {
  return e('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    e('rect', { x: 1.6, y: 2.6, width: 12.8, height: 10.8, rx: 2.4, stroke: 'currentColor', strokeWidth: 1.4 }),
    e('line', { x1: 6.1, y1: 3, x2: 6.1, y2: 13, stroke: 'currentColor', strokeWidth: 1.4 }))
}

// Square ghost icon-button used for the nav collapse / expand toggle.
function NavToggle({ collapsed, onClick }) {
  return e('button', {
    className: 'nav-toggle',
    onClick,
    title: collapsed ? 'Expand sidebar' : 'Collapse sidebar',
    'aria-label': collapsed ? 'Expand sidebar' : 'Collapse sidebar',
  }, e(PanelIcon, { size: 16 }))
}

const NAV_GROUPS = [
  {
    label: 'Orchestration',
    items: [
      { id: 'workflows', label: 'Workflows', icon: 'workflows' },
      { id: 'tasks', label: 'Tasks', icon: 'tasks' },
      { id: 'runs', label: 'Executions', icon: 'history' },
    ],
  },
  {
    foot: true,
    items: [{ id: 'settings', label: 'Settings', icon: 'settings' }],
  },
]

export default function App() {
  // subscribe to the data model; re-render on reloads
  useSyncExternalStore(subscribe, getRevision)
  const [ready, setReady] = useState(DB.loaded)
  const [loadErr, setLoadErr] = useState(null)
  useEffect(() => {
    if (DB.loaded) { setReady(true); return }
    loadAll().then(() => setReady(true)).catch(er => setLoadErr(String(er)))
  }, [])

  const [state, setState] = useState({ view: 'workflows', workflowId: null, runId: null, __idx: 0 })
  const [toastMsg, setToastMsg] = useState(null)
  const [confirm, setConfirm] = useState(null) // {icon,tone,title,message,confirmLabel,onConfirm}

  // Left-nav collapse (Claude-desktop style): the rail slides away and a
  // toggle in the topbar brings it back. Persisted across sessions.
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return localStorage.getItem('ad_nav_collapsed') === '1' } catch (e) { return false }
  })
  const toggleNav = useCallback(() => {
    setNavCollapsed(c => {
      const n = !c
      try { localStorage.setItem('ad_nav_collapsed', n ? '1' : '0') } catch (e) {}
      return n
    })
  }, [])

  const scrollMap = useRef({})
  const pendingTop = useRef(null)
  const pendingReset = useRef(null)  // top-level nav reset target, applied after unwinding history
  const stateRef = useRef(state)
  stateRef.current = state

  const workflows = DB.WF
  const tasks = DB.TASKS

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(t => t === m ? null : t), 2400) }, [])
  const nav = useCallback((s) => {
    const c = document.querySelector('.content')
    if (c) scrollMap.current[keyFor(stateRef.current)] = c.scrollTop
    const next = { view: 'workflows', workflowId: null, runId: null, taskId: null, ...s }
    next.__idx = (stateRef.current.__idx || 0) + 1
    pendingTop.current = scrollMap.current[keyFor(next)] || 0
    window.history.pushState(next, '')
    setState(next)
  }, [])

  // Top-level sidebar nav: clear the back stack and start fresh at this view.
  // The History API can't delete entries, so we unwind to the base entry with
  // go(-depth) and replace it (in the popstate handler) with the target view —
  // afterwards the back stack holds only this page.
  const navRoot = useCallback((s) => {
    const c = document.querySelector('.content')
    if (c) scrollMap.current[keyFor(stateRef.current)] = c.scrollTop
    const next = { view: 'workflows', workflowId: null, runId: null, taskId: null, ...s, __idx: 0 }
    const depth = stateRef.current.__idx || 0
    if (depth > 0) {
      pendingReset.current = next      // applied when go(-depth) lands on the base entry
      window.history.go(-depth)
    } else {
      pendingTop.current = 0
      window.history.replaceState(next, '')
      setState(next)
    }
  }, [])

  useEffect(() => {
    const target = pendingTop.current || 0
    pendingTop.current = null
    let tries = 0
    const apply = () => {
      const c = document.querySelector('.content')
      if (!c) return
      c.scrollTop = target
      if (target > 0 && c.scrollTop < target - 1 && tries < 8) { tries++; requestAnimationFrame(apply) }
    }
    apply()
  }, [state])

  const ctx = {
    state, nav, navRoot, workflows, tasks, toast,
    // existing task opens the read-only detail page; a new task goes straight to the editor
    openTask: (id) => nav(id === '__new' ? { view: 'taskEdit', taskId: id } : { view: 'task', taskId: id }),
    editTask: (id) => nav({ view: 'taskEdit', taskId: id }),
    // Cancel from the editor returns to detail (existing) or the list (new)
    closeTask: () => { const id = stateRef.current.taskId; nav(id && id !== '__new' ? { view: 'task', taskId: id } : { view: 'tasks' }) },
    saveTask: (draft) => {
      const name = draft.name
      actions.saveTask(draft)
        // return to wherever the editor was opened from
        .then(() => { toast(draft.id === '__new' ? 'Task created: ' + name : 'Saved ' + name); window.history.back() })
        .catch(er => toast(String(er)))
    },
    // Delete a task — the editor gates this on zero usage and the backend re-checks
    // (409 if any workflow still references it), surfaced here as a toast.
    deleteTask: (id) => {
      const x = DB.taskById[id] || tasks.find(s => s.id === id)
      actions.deleteTask(id)
        .then(() => { toast('Deleted ' + (x ? x.name : 'task')); nav({ view: 'tasks' }) })
        .catch(er => toast(String(er)))
    },
    openSchedule: (w) => nav({ view: 'schedule', workflowId: w.id }),
    saveTriggers: (w, triggers) => {
      actions.saveTriggers(w.id, triggers)
        .then(() => { toast('Triggers updated for ' + w.name); nav({ view: 'workflow', workflowId: w.id }) })
        .catch(er => toast(String(er)))
    },
    editWorkflow: (w, editTab) => nav({ view: 'workflowEdit', workflowId: w.id, editTab: editTab || null }),
    newWorkflow: () => nav({ view: 'workflowEdit', workflowId: '__new' }),
    launchRun: (w, perSlotParams) => {
      // SPEC §6.5: run params are sent per-slot ({slotIdx: {KEY: value}}) so two
      // refs of the same task keep distinct values — never flattened.
      actions.launchRun(w.id, w.version || 1, perSlotParams || {})
        .then(ex => { toast('Started ' + w.name); nav({ view: 'run', runId: ex.id, workflowId: w.id }) })
        .catch(er => toast(String(er)))
    },
    createWorkflow: (draft) => {
      actions.createWorkflow(draft)
        // return to wherever the editor was opened from
        .then(() => { toast('Created ' + (draft.name || 'workflow')); window.history.back() })
        .catch(er => toast(String(er)))
    },
    saveWorkflow: (draft) => {
      actions.saveWorkflow(draft)
        // return to wherever the editor was opened from (workflow detail, list, schedule…)
        .then(() => { toast('Saved ' + draft.name); window.history.back() })
        .catch(er => toast(String(er)))
    },
    deleteWorkflow: (id) => {
      const x = workflows.find(v => v.id === id)
      actions.deleteWorkflow(id)
        .then(() => { toast('Deleted ' + (x ? x.name : 'workflow')); nav({ view: 'workflows' }) })
        .catch(er => toast(String(er)))
    },
    // generic destructive-action confirmation — opts: {icon,tone,title,message,confirmLabel,onConfirm}
    confirm: (opts) => setConfirm(opts),
  }

  useEffect(() => {
    window.history.replaceState({ view: 'workflows', workflowId: null, runId: null, taskId: null, __idx: 0 }, '')
    const onPop = (ev) => {
      const c = document.querySelector('.content')
      if (c) scrollMap.current[keyFor(stateRef.current)] = c.scrollTop
      // Finishing a top-level nav reset: we've unwound to the base entry — replace
      // it with the target view so the back stack holds only this page.
      if (pendingReset.current) {
        const t = pendingReset.current
        pendingReset.current = null
        window.history.replaceState(t, '')
        pendingTop.current = 0
        setState(t)
        return
      }
      const st = ev.state || { view: 'workflows', workflowId: null, runId: null, taskId: null, __idx: 0 }
      pendingTop.current = scrollMap.current[keyFor(st)] || 0
      setState(st)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // trackpad two-finger horizontal swipe → history back/forward
  useEffect(() => {
    let acc = 0, dir = 0, active = false, fired = false, idle = null
    const COMMIT = 110
    const reset = () => { active = false; fired = false; acc = 0; dir = 0 }
    const onWheel = (ev) => {
      const ax = Math.abs(ev.deltaX), ay = Math.abs(ev.deltaY)
      if (!active && (ax <= ay * 1.4 || ax < 1.5)) return
      if (!active) {
        let n = ev.target
        while (n && n !== document.body) {
          if (n.scrollWidth > n.clientWidth + 2) {
            const cs = getComputedStyle(n).overflowX
            if (cs === 'auto' || cs === 'scroll') return
          }
          n = n.parentElement
        }
        active = true; dir = ev.deltaX < 0 ? -1 : 1
      }
      if (ev.cancelable) ev.preventDefault()
      if (Math.sign(ev.deltaX) === Math.sign(dir) || acc === 0) acc += ev.deltaX
      dir = acc < 0 ? -1 : 1
      if (!fired && Math.abs(acc) >= COMMIT) {
        fired = true
        if (dir < 0) window.history.back(); else window.history.forward()
      }
      clearTimeout(idle)
      idle = setTimeout(reset, 90)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => { window.removeEventListener('wheel', onWheel); clearTimeout(idle) }
  }, [])

  // breadcrumbs
  const wf = workflows.find(w => w.id === state.workflowId)
  const crumbs = []
  if (state.view === 'task' || state.view === 'taskEdit') {
    const isNewTask = state.taskId === '__new'
    const st = isNewTask ? null : DB.taskById[state.taskId]
    crumbs.push({ label: 'Tasks', to: { view: 'tasks' }, link: true })
    if (state.view === 'taskEdit') {
      if (isNewTask) crumbs.push({ label: 'New task', cur: true })
      else {
        crumbs.push({ label: st ? st.name : 'Task', to: { view: 'task', taskId: state.taskId }, link: true, mono: true })
        crumbs.push({ label: 'Edit', cur: true })
      }
    } else {
      crumbs.push({ label: st ? st.name : 'Task', cur: true, mono: true })
    }
  } else if (state.view === 'workflowEdit') {
    crumbs.push({ label: 'Workflows', to: { view: 'workflows' }, link: true })
    if (state.workflowId === '__new') crumbs.push({ label: 'New workflow', cur: true })
    else {
      if (wf) crumbs.push({ label: wf.name, to: { view: 'workflow', workflowId: wf.id }, link: true, mono: true })
      crumbs.push({ label: 'Edit', cur: true })
    }
  } else if (state.view === 'schedule') {
    crumbs.push({ label: 'Workflows', to: { view: 'workflows' }, link: true })
    if (wf) crumbs.push({ label: wf.name, to: { view: 'workflow', workflowId: wf.id }, link: true, mono: true })
    crumbs.push({ label: 'Triggers', cur: true })
  } else if (state.view === 'run') {
    crumbs.push({ label: 'Executions', to: { view: 'runs', workflowId: state.workflowId || null }, link: true })
    crumbs.push({ label: state.runId || 'Execution', cur: true, mono: true })
  } else if (state.view === 'prepare') {
    crumbs.push({ label: 'Workflows', to: { view: 'workflows' }, link: true })
    if (wf) crumbs.push({ label: wf.name, to: { view: 'workflow', workflowId: wf.id }, link: true, mono: true })
    crumbs.push({ label: 'Run', cur: true })
  } else {
    const titles = { workflows: 'Workflows', tasks: 'Tasks', runs: 'Executions', settings: 'Settings', workflow: 'Workflows' }
    if (state.view === 'workflow' && wf) {
      crumbs.push({ label: 'Workflows', to: { view: 'workflows' }, link: true })
      crumbs.push({ label: wf.name, cur: true, mono: true })
    } else if (state.view === 'runs' && wf) {
      crumbs.push({ label: 'Executions', to: { view: 'runs' }, link: true })
      crumbs.push({ label: wf.name, cur: true, mono: true })
    } else {
      crumbs.push({ label: titles[state.view] || cap(state.view), cur: true })
    }
  }

  let page
  if (loadErr) page = e('div', { className: 'page' }, e('div', { className: 'empty' }, 'Backend unavailable: ' + loadErr))
  else if (!ready) page = e('div', { className: 'page' }, e('div', { className: 'empty' }, 'Loading data directory…'))
  else if (state.view === 'workflows') page = e(WorkflowsList, { ctx })
  else if (state.view === 'workflow') page = e(WorkflowDetail, { ctx })
  else if (state.view === 'workflowEdit') page = e(WorkflowEdit, { ctx })
  else if (state.view === 'tasks') page = e(TasksLibrary, { ctx })
  // After a task is deleted, loadAll() re-renders before the nav to the list lands —
  // guard the task views so they never mount on a now-missing id (would crash to a blank screen).
  else if (state.view === 'task') page = DB.taskById[state.taskId] ? e(TaskDetail, { ctx }) : e('div', { className: 'page' }, e('div', { className: 'empty' }, 'Task not found.'))
  else if (state.view === 'taskEdit') page = (state.taskId === '__new' || DB.taskById[state.taskId]) ? e(TaskEditor, { ctx }) : e('div', { className: 'page' }, e('div', { className: 'empty' }, 'Task not found.'))
  else if (state.view === 'runs') page = e(RunsView, { ctx })
  else if (state.view === 'run') page = e(RunDetailPage, { ctx })
  else if (state.view === 'prepare') page = e(RunPrepare, { ctx })
  else if (state.view === 'settings') page = e(SettingsView, { ctx })
  else if (state.view === 'schedule') page = e(TriggersEditor, { ctx })
  else page = e('div', { className: 'page' }, '—')

  const activeNav = (state.view === 'workflow' || state.view === 'workflowEdit' || state.view === 'prepare' || state.view === 'schedule') ? 'workflows'
    : (state.view === 'task' || state.view === 'taskEdit') ? 'tasks'
    : state.view === 'run' ? 'runs'
    : state.view

  return e('div', { className: 'app' + (navCollapsed ? ' nav-collapsed' : '') },
    e('aside', { className: 'sidebar' },
      e('div', { className: 'brand' },
        e('div', { className: 'brand-mark' }, e(Icon, { name: 'hammer', size: 16 })),
        e('div', { className: 'brand-name' }, 'Worker ', e('b', null, 'Forge')),
        e(NavToggle, { collapsed: false, onClick: toggleNav })),
      e('nav', { className: 'nav', style: { flex: 1 } },
        NAV_GROUPS.map((g, gi) => e('div', { key: gi, className: 'nav-group', style: g.foot ? { marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--line-soft)' } : null },
          g.label && e('div', { className: 'nav-label' }, g.label),
          g.items.map(n => e('button', { key: n.id, className: 'nav-item' + (activeNav === n.id ? ' active' : ''), onClick: () => navRoot({ view: n.id }) },
            e(Icon, { name: n.icon, size: 17 }), n.label,
            n.id === 'workflows' && e('span', { className: 'count' }, workflows.length),
            n.id === 'tasks' && e('span', { className: 'count' }, tasks.length))))))),

    e('main', { className: 'main' },
      e('div', { className: 'topbar' },
        navCollapsed && e(NavToggle, { collapsed: true, onClick: toggleNav }),
        e('div', { className: 'crumbs' },
          crumbs.map((c, i) => [
            i > 0 && e('span', { key: 's' + i, className: 'sep' }, '/'),
            e('span', { key: i, className: 'c ' + (c.link ? 'link ' : '') + (c.cur ? 'cur ' : '') + (c.mono ? 'mono' : ''), onClick: () => c.to && nav(c.to) }, c.label)]))),
      e('div', { className: 'content' }, page)),

    confirm && e(ConfirmModal, { ...confirm,
      onClose: () => setConfirm(null),
      onConfirm: () => { const fn = confirm.onConfirm; setConfirm(null); fn && fn() } }),
    toastMsg && e('div', { className: 'toast' }, e(Icon, { name: 'check', size: 15, style: { color: 'var(--accent)' } }), toastMsg))
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }
