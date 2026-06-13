/* ============================================================
   Executions: history list + execution detail (real backend data).
   Data is fetched live.
   ============================================================ */
import React from 'react'
import { e, Icon, Badge, Dot, Btn } from '../ui'
import { api } from '../api'
import { DB, fmtDurSec, fmtStamp, fmtAgeIso, tzDate, tzShort } from '../model'

const { useState, useEffect, useRef } = React

const PAGE_SIZE = 50
const RUN_COLS = 'minmax(220px,1fr) 120px 150px 110px 184px 28px'

// windowed page numbers, e.g. [1, "…", 4, 5, 6, "…", 9]
function pageWindow(p, n) {
  const out = [1]
  const lo = Math.max(2, p - 1), hi = Math.min(n - 1, p + 1)
  if (lo > 2) out.push('…')
  for (let i = lo; i <= hi; i++) out.push(i)
  if (hi < n - 1) out.push('…')
  if (n > 1) out.push(n)
  return out
}

const wfName = (r) => r.workflow_name || (DB.WF.find(w => w.id === r.wf) || {}).name || r.wf

// ---- shared timestamp formatting ----
// Canonical "YYYY-MM-DD HH:MM:SS" in the user's display zone, matching the
// executions list and the schedule pages — one consistent format app-wide.
function fmtClock(iso) {
  return fmtStamp(iso)
}
// Per-log-line clock (HH:MM:SS) in the display zone; tzDate shifts the instant so
// its getUTC* fields read as local wall-clock.
function fmtClockTime(iso) {
  if (!iso) return ''
  const d = tzDate(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}
function fmtSpan(s) {
  if (s == null) return '—'
  s = Math.round(s)
  const m = Math.floor(s / 60), ss = s % 60
  return m ? (ss ? m + 'm ' + String(ss).padStart(2, '0') + 's' : m + 'm') : ss + 's'
}

/* ---------------- RUNS LIST ---------------- */
export function RunsView({ ctx }) {
  const filterWf = ctx.state.workflowId
  const [statusF, setStatusF] = useState('all')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const listRef = useRef(null)

  useEffect(() => {
    let live = true
    const q = { page, workflow_id: filterWf || undefined }
    if (statusF !== 'all') q.status = statusF
    api.listExecutions(q).then(res => {
      if (!live) return
      setRows(res.items)
      setTotal(res.total)
    }).catch(() => { if (live) { setRows([]); setTotal(0) } })
    return () => { live = false }
  }, [statusF, page, filterWf])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const curPage = Math.min(page, pageCount)
  const start = (curPage - 1) * PAGE_SIZE
  const end = Math.min(start + (rows ? rows.length : 0), total)

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0 }, [curPage, statusF])

  function changeStatus(s) { setStatusF(s); setPage(1) }
  function goPage(p) { setPage(Math.min(Math.max(1, p), pageCount)) }

  const pageRuns = rows || []

  return e('div', { className: 'page page-wide fadein' },
    e('div', { className: 'ph' },
      e('div', null,
        e('h1', null, filterWf ? 'Executions · ' + wfName({ wf: filterWf }) : 'Execution history'),
        e('p', null, filterWf
          ? e('span', { className: 'c link', style: { cursor: 'pointer', color: 'var(--accent)' }, onClick: () => ctx.nav({ view: 'workflow', workflowId: filterWf }) }, '← back to workflow')
          : 'Every execution across all workflows, newest first.'))),

    e('div', { className: 'toolbar' },
      e('div', { className: 'seg' },
        ['all', 'succeeded', 'failed'].map(s => e('button', { key: s, className: statusF === s ? 'on' : '', onClick: () => changeStatus(s) },
          s === 'all' ? 'All' : s === 'succeeded' ? 'Succeeded' : 'Failed')))),

    e('div', { className: 'card', style: { overflow: 'hidden' } },
      e('div', { className: 'wf-head', style: { gridTemplateColumns: RUN_COLS } },
        e('span', null, 'Execution'),
        e('span', null, 'Status'),
        e('span', null, 'Trigger'),
        e('span', null, 'Duration'),
        e('span', null, 'Started'),
        e('span', null, '')),
      e('div', { ref: listRef },
        rows == null ? e('div', { className: 'empty' }, 'Loading…')
          : pageRuns.map(r => e(RunRow, { key: r.id, r, onClick: () => ctx.nav({ view: 'run', runId: r.id, workflowId: filterWf || null }) })),
        rows != null && total === 0 && e('div', { className: 'empty' }, 'No runs.')),
      e(Pager, { page: curPage, pageCount, onPage: goPage, total, start, end })))
}

export function Pager({ page, pageCount, onPage, total, start, end }) {
  if (pageCount <= 1) return null
  return e('div', { className: 'pager' },
    e('span', { className: 'pager-info' }, (total === 0 ? 0 : start + 1) + '–' + end + ' of ' + total),
    e('div', { className: 'pager-btns' },
      e('button', { className: 'pg', disabled: page <= 1, onClick: () => onPage(page - 1), 'aria-label': 'Previous page' }, e(Icon, { name: 'chevR', size: 14, style: { transform: 'rotate(180deg)' } })),
      pageWindow(page, pageCount).map((n, i) => n === '…'
        ? e('span', { key: 'gap' + i, className: 'pg-gap' }, '…')
        : e('button', { key: n, className: 'pg' + (n === page ? ' on' : ''), onClick: () => onPage(n) }, n)),
      e('button', { className: 'pg', disabled: page >= pageCount, onClick: () => onPage(page + 1), 'aria-label': 'Next page' }, e(Icon, { name: 'chevR', size: 14 }))))
}

export function RunRow({ r, onClick }) {
  const dur = r.duration_sec != null ? fmtDurSec(r.duration_sec) : '—'
  return e('div', { className: 'wf-row', style: { gridTemplateColumns: RUN_COLS, minHeight: 56, cursor: 'pointer' }, onClick },
    e('div', { className: 'wf-name' },
      e('div', { className: 'nm', style: { fontSize: 13 } }, wfName(r)),
      e('div', { className: 'ds', title: r.id }, r.id)),
    e('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
      e(Badge, { status: r.status, noDot: true }),
      (r.status === 'succeeded' && r.degraded)
        && e(Badge, { status: 'continued', noDot: true }, 'continued')),
    e('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 } },
      e('div', { style: { fontSize: 12.5, color: 'var(--tx-mid)' } }, r.trigger),
      e('div', { style: { fontSize: 11.5, color: 'var(--tx-lo)' } }, 'by ' + r.actor)),
    e('div', { className: 'mono', style: { display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--tx-mid)' } }, dur),
    e('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minWidth: 0 }, title: r.status === 'queued' ? 'queued' : fmtStamp(r.started_at) },
      r.status === 'queued'
        ? e('span', { style: { fontSize: 13, color: 'var(--tx-lo)' } }, 'queued')
        : e('span', { style: { fontSize: 13, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, fmtAgeIso(r.started_at)),
      r.status !== 'queued' && e('span', { className: 'mono', style: { fontSize: 11, color: 'var(--tx-lo)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, fmtStamp(r.started_at))),
    e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end' } }, e(Icon, { name: 'chevR', size: 15, style: { color: 'var(--tx-lo)' } })))
}

/* ---------------- EXECUTION DETAIL (real data) ---------------- */
// Flatten the execution's stages → a list of {idx, stageIndex, task} rows.
function flattenTasks(ex) {
  const rows = []
  let idx = 0
  ;(ex.stages || []).forEach((st, si) => {
    ;(st.tasks || []).forEach((t, ti) => { rows.push({ idx: idx++, stageIndex: si, taskIndex: ti, task: t }) })
  })
  return rows
}

// A continued (tolerated-failure) task shows the orange "continued" dot rather
// than the red "failed" one — its failure didn't block the run.
function taskDotStatus(t) {
  return t.continued ? 'continued' : t.status
}

function RunDetail({ runId, ctx }) {
  const [ex, setEx] = useState(null)
  const [err, setErr] = useState(null)
  const [selTask, setSelTask] = useState(0)
  const [selAttempt, setSelAttempt] = useState(0)
  const [selStep, setSelStep] = useState(0)
  const [detailTab, setDetailTab] = useState('meta')
  const [logCache, setLogCache] = useState({})       // log_id -> lines
  const [reloadKey, setReloadKey] = useState(0)       // bump to restart the poll loop
  const pollRef = useRef(null)

  // load + poll while running. reloadKey lets an action (retry/skip) that may
  // leave the run 'running' restart polling, which otherwise only arms here.
  useEffect(() => {
    let live = true
    function load() {
      api.getExecution(runId).then(res => {
        if (!live) return
        setEx(res)
        if (res.status === 'running' || res.status === 'queued') {
          pollRef.current = setTimeout(load, 1200)
        }
      }).catch(er => { if (live) setErr(String(er)) })
    }
    load()
    return () => { live = false; if (pollRef.current) clearTimeout(pollRef.current) }
  }, [runId, reloadKey])

  // All derived values computed null-safe so every hook below runs
  // unconditionally (Rules of Hooks) — the early returns come after.
  const rows = ex ? flattenTasks(ex) : []
  const stageGroups = ex ? (ex.stages || []) : []
  const halted = rows.findIndex(r => ['failed', 'cancelled', 'running', 'interrupted'].includes(r.task.status))
  const selIdx = Math.min(selTask, Math.max(0, rows.length - 1))
  const curRow = rows[selIdx] || null
  const cur = curRow ? curRow.task : null
  const attempts = cur ? (cur.attempts || []) : []
  const selAtt = Math.max(0, Math.min(selAttempt, attempts.length - 1))
  const att = attempts[selAtt] || null

  // default selection: first failed/cancelled/running task, else first
  useEffect(() => { if (ex) setSelTask(halted >= 0 ? halted : 0) }, [runId, rows.length])
  // default to last attempt when the task changes, and jump to a freshly-added
  // attempt the moment it appears (e.g. a live retry) so it shows immediately
  // rather than staying hidden behind the previously-selected attempt.
  useEffect(() => { setSelAttempt(Math.max(0, attempts.length - 1)) }, [selIdx, attempts.length])
  // default step to first failed/running of the selected attempt
  useEffect(() => {
    const steps = att ? (att.steps || []) : []
    const f = steps.findIndex(s => ['failed', 'cancelled', 'running', 'interrupted'].includes(s.status))
    setSelStep(f >= 0 ? f : 0)
  }, [selIdx, selAtt, runId])
  // auto-load the open step's log (the header onClick only fires on manual toggles,
  // so the initially-expanded step would otherwise sit on "Loading…" forever)
  useEffect(() => {
    if (detailTab !== 'logs' || !att) return
    const sc = (att.steps || [])[selStep]
    if (sc && sc.log_id) loadLog(sc.log_id)
  }, [detailTab, selStep, selAtt, selIdx, runId, att])

  if (err) return e('div', { className: 'empty', style: { padding: '60px 0' } }, 'Execution not found.')
  if (!ex) return e('div', { className: 'empty', style: { padding: '60px 0' } }, 'Loading…')

  const tolerated = ex.status === 'succeeded' && cur && (cur.status === 'failed' || cur.status === 'skipped')
  const isDegraded = ex.status === 'succeeded' && !!ex.degraded
  // The selected task's stage is still running its other tasks. A failed task
  // here gets live Skip/Retry (acts on this task only) without waiting for the
  // run to go terminal — matched on the backend by the same condition.
  const curStageRunning = !!(curRow && stageGroups[curRow.stageIndex] && stageGroups[curRow.stageIndex].status === 'running')
  const runTerminal = ex.status === 'failed' || ex.status === 'cancelled'

  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

  // run-level summary. stampZ appends the display-zone tag so a lone timestamp
  // (no column header to carry it) is unambiguous.
  const stampZ = (iso) => iso ? fmtClock(iso) + ' ' + tzShort(iso) : '—'
  const runEnd = ex.finished_at
  const wfCells = [
    { label: 'Version', value: 'v' + (ex.workflow_version || 1), mono: true, title: 'Workflow version used by this execution' },
    { label: 'Started', value: ex.status === 'queued' ? 'queued' : stampZ(ex.started_at), mono: true },
    { label: 'Finished', value: ex.status === 'running' ? 'in progress' : stampZ(runEnd), mono: true, tone: ex.status === 'running' ? 'run' : null },
    { label: 'Duration', value: fmtSpan(ex.duration_sec), mono: true },
    { label: 'Trigger', value: cap(ex.trigger) + ' · ' + ex.actor },
  ]

  // per-attempt info cells
  const retriesAllowed = att ? (att.retries_allowed || 0) : 0
  const nearTimeout = att && att.duration_sec != null && att.timeout_sec && att.duration_sec >= att.timeout_sec * 0.8
  const metaCells = att ? [
    { label: 'Version', value: 'v' + (cur.task_version || 1), mono: true },
    { label: 'Start', value: stampZ(att.started_at), mono: true },
    { label: 'End', value: att.status === 'running' ? '—' : stampZ(att.finished_at), mono: true },
    { label: 'Duration', value: att.status === 'running' ? '—' : fmtSpan(att.duration_sec), mono: true, tone: nearTimeout ? 'warn' : null },
    { label: 'Timeout', value: att.timeout_sec ? fmtSpan(att.timeout_sec) : 'none', mono: true },
    { label: 'Auto retries', value: retriesAllowed === 0 ? 'none' : ((att.retries_used != null ? att.retries_used : selAtt) + ' / ' + retriesAllowed), mono: true },
  ] : []

  // params for the selected task: run params filtered/displayed
  const params = paramsForTask(cur)

  // lazy-load a step's log lines
  function loadLog(logId) {
    if (!logId || logCache[logId]) return
    api.getLog(runId, logId).then(doc => setLogCache(c => ({ ...c, [logId]: doc.lines || [] }))).catch(() => {})
  }

  // Reveal the run's $WORKSPACE in the OS file manager (Electron); toast in dev/browser.
  const revealWorkspace = () => {
    if (window.backend && window.backend.revealPath && ex.workspace_dir) window.backend.revealPath(ex.workspace_dir)
    else ctx.toast && ctx.toast('Opening workspace in Finder')
  }
  // run-level (aggregate) recovery availability. Applies only to a terminal
  // failed/cancelled run that still has stuck (failed/cancelled) tasks. These
  // act on every stuck task at once — distinct from the per-task panel controls.
  const stuckCount = rows.filter(r => r.task.status === 'failed' || r.task.status === 'cancelled').length
  const canRecover = (ex.status === 'failed' || ex.status === 'cancelled') && stuckCount > 0
  const stuckLabel = stuckCount + (stuckCount === 1 ? ' failed task' : ' failed tasks')

  const actions = e(React.Fragment, null,
    ex.status !== 'queued' && e(Btn, { variant: 'ghost', icon: 'folder', title: 'Reveal workspace in Finder — ' + (ex.workspace_dir || ''), onClick: revealWorkspace }, 'Workspace'),
    (ex.status === 'running' || ex.status === 'queued')
      ? e(Btn, { variant: 'danger', icon: 'x', onClick: () => ctx.confirm && ctx.confirm({
          icon: 'x', title: 'Cancel execution',
          message: e(React.Fragment, null, 'Cancel this run of ', e('b', null, ex.workflow_name), '? Any tasks still running are stopped and the run can\'t be resumed — you\'d need to re-run it.'),
          confirmLabel: 'Cancel execution', cancelLabel: 'Keep running', onConfirm: () => act('cancel') }) }, 'Cancel')
      : e(Btn, { variant: 'ghost', icon: 'sync', onClick: () => ctx.nav({ view: 'prepare', workflowId: ex.workflow_id, prefill: { params: ex.params || {}, taskParams: ex.task_params || {}, fromRun: ex.id, version: ex.workflow_version || 1 } }) }, 'Re-run'),
    // run-level aggregate recovery — failed/cancelled runs only. Skip failures
    // skips every failure and finishes the remaining stages (succeeded + continued);
    // Retry retries every stuck task in place and resumes the run to completion.
    canRecover && e(Btn, { variant: 'ghost', icon: 'skip', title: 'Skip every failure and finish the remaining stages', onClick: () => ctx.confirm && ctx.confirm({
      icon: 'skip', tone: 'warn', title: 'Skip failures & continue',
      message: e(React.Fragment, null, 'Skip ', e('b', null, stuckLabel), ' across this run and let the remaining stages finish? The skipped tasks stay marked skipped and the run completes as ', e('b', null, 'continued'), '.'),
      confirmLabel: 'Skip & continue', cancelLabel: 'Back', onConfirm: () => act('skip-failed', 'Skipped failures — continuing run') }) }, 'Skip failures'),
    canRecover && e(Btn, { variant: 'primary', icon: 'sync', title: 'Retry every failed task and resume this run', onClick: () => ctx.confirm && ctx.confirm({
      icon: 'sync', title: 'Retry failed tasks',
      message: e(React.Fragment, null, 'Retry ', e('b', null, stuckLabel), ' in place and resume this run from where it stopped? Tasks that already succeeded won\'t run again.'),
      confirmLabel: 'Retry failed', cancelLabel: 'Back', onConfirm: () => act('retry-from-failure', 'Retrying failed tasks — resuming run') }) }, 'Retry'))

  // cancel is an in-place transition; skip-failed / retry-from-failure are the
  // run-level aggregate recovery actions (re-run otherwise goes via prepare).
  function act(kind, toastMsg) {
    const fn = { cancel: api.cancelExecution, 'skip-failed': api.skipFailed, 'retry-from-failure': api.retryFromFailure }[kind]
    fn(runId).then(() => {
      ctx.toast && ctx.toast(toastMsg || cap(kind.replace(/-/g, ' ')))
      setReloadKey(k => k + 1)
    }).catch(er => ctx.toast && ctx.toast(String(er)))
  }

  // task-scoped controls — addressed by (stage, task) position of the selected task.
  function taskAct(kind, toastMsg) {
    if (!curRow) return
    const fn = { cancel: api.cancelTask, skip: api.skipTask, retry: api.retryTask }[kind]
    fn(runId, curRow.stageIndex, curRow.taskIndex).then(() => {
      ctx.toast && ctx.toast(toastMsg)
      setReloadKey(k => k + 1)
    }).catch(er => ctx.toast && ctx.toast(String(er)))
  }

  return e(React.Fragment, null,
    e('div', { className: 'ph' },
      e('div', { style: { minWidth: 0 } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 11, marginBottom: 5, flexWrap: 'wrap' } },
          e('h1', { style: { margin: 0 } }, ex.workflow_name),
          ex.status === 'running'
            ? e(Badge, { status: 'running', pulse: true })
            : isDegraded
            ? e('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                e(Badge, { status: ex.status, noDot: true }),
                e(Badge, { status: 'continued', noDot: true }, 'continued'))
            : e(Badge, { status: ex.status, noDot: true })),
        e('p', { className: 'mono', style: { fontSize: 12.5 } }, ex.id)),
      e('div', { className: 'ph-actions' }, actions)),

    // run summary strip
    e('div', { className: 'card run-summary' },
      e('div', { className: 'meta-grid' },
        wfCells.map(c => e('div', { key: c.label, className: 'meta-cell', title: c.title || undefined },
          e('span', { className: 'meta-k' }, c.label),
          e('span', { className: 'meta-v' + (c.mono ? ' mono' : '') + (c.tone ? ' t-' + c.tone : '') }, c.value))))),

    e('div', { className: 'section-title', style: { margin: '24px 0 12px' } }, stageGroups.length + ' stages · ' + rows.length + ' tasks'),
    e('div', { className: 'run-grid' },
      // stage + task rail
      e('div', { className: 'card run-rail-card' },
        e('div', { className: 'run-rail' },
          stageGroups.map((st, si) => e('div', { key: si, style: { marginBottom: si < stageGroups.length - 1 ? 10 : 0 } },
            e('div', { className: 'stage-tag', style: { justifyContent: 'flex-start', margin: '0 0 5px', padding: '0 4px' } }, 'Stage ' + (si + 1)),
            (st.tasks || []).map(t => {
              const row = rows.find(r => r.stageIndex === si && r.task === t)
              const idx = row ? row.idx : 0
              return e('div', { key: idx, className: 'run-task' + (idx === selIdx ? ' on' : ''), onClick: () => setSelTask(idx) },
                e(Dot, { status: taskDotStatus(t), pulse: t.status === 'running' }),
                e('span', { className: 'rs-nm' }, t.name),
                t.status === 'succeeded'
                  ? e('span', { className: 'rs-dur' }, fmtSpan(t.duration_sec))
                  : t.status === 'skipped'
                  ? e('span', { className: 'rs-skipped' }, 'Skipped')
                  : null)
            }))))),

      // right column — unified task panel
      e('div', { className: 'run-detail-col' },
        cur && e('div', { className: 'task-panel' },
          e('div', { className: 'tp-head' },
            e('span', { className: 'tp-name' }, cur.name),
            cur.status === 'running' ? e(Badge, { status: 'running', pulse: true })
              : cur.status === 'queued' ? e(Badge, { status: 'queued', noDot: true })
              : cur.status === 'skipped' ? e(Badge, { status: 'skipped', noDot: true })
              : cur.status === 'cancelled' ? e(Badge, { status: 'cancelled', noDot: true })
              : e(React.Fragment, null,
                  e(Badge, { status: cur.status, noDot: true }),
                  cur.continued && cur.status === 'failed' && e(Badge, { status: 'continued', noDot: true }, 'continued')),
            e('span', { className: 'spacer' }),
            // task-scoped controls — recovery happens per-task. Cancel acts on a
            // live run; Skip/Retry on a terminal (failed/cancelled) run.
            ex.status !== 'succeeded' && e('div', { style: { display: 'flex', gap: 8 } },
              cur.status === 'running' && e(Btn, { size: 'sm', variant: 'danger', icon: 'x', onClick: () => ctx.confirm && ctx.confirm({
                icon: 'x', tone: 'warn', title: 'Cancel task',
                message: e(React.Fragment, null, 'Stop ', e('b', null, cur.name), ' only? Just this task is cancelled — the rest of the workflow keeps running, and you can retry this task afterward.'),
                confirmLabel: 'Cancel task', cancelLabel: 'Keep running', onConfirm: () => taskAct('cancel', 'Cancelling ' + cur.name) }) }, 'Cancel'),
              (runTerminal || curStageRunning) && (cur.status === 'failed' || cur.status === 'cancelled') && e(React.Fragment, null,
                e(Btn, { size: 'sm', variant: 'ghost', icon: 'skip', onClick: () => ctx.confirm && ctx.confirm({
                  icon: 'skip', tone: 'warn', title: 'Skip task',
                  message: e(React.Fragment, null, 'Skip ', e('b', null, cur.name), '? This task is marked skipped so it stops blocking the run', curStageRunning ? ' — its other tasks keep running.' : ' and the run advances.'),
                  confirmLabel: 'Skip task', cancelLabel: 'Cancel', onConfirm: () => taskAct('skip', 'Skipped ' + cur.name) }) }, 'Skip'),
                e(Btn, { size: 'sm', variant: 'primary', icon: 'sync', onClick: () => taskAct('retry', 'Retrying ' + cur.name) }, 'Retry')),
              (ex.status === 'failed' || ex.status === 'cancelled') && cur.status === 'queued' && e(Btn, { size: 'sm', variant: 'ghost', icon: 'skip', onClick: () => ctx.confirm && ctx.confirm({
                icon: 'skip', tone: 'warn', title: 'Skip task',
                message: e(React.Fragment, null, 'Skip ', e('b', null, cur.name), '? This task is marked skipped.'),
                confirmLabel: 'Skip task', cancelLabel: 'Cancel', onConfirm: () => taskAct('skip', 'Skipped ' + cur.name) }) }, 'Skip'))),

          // attempt switcher — always shown
          e('div', { className: 'attempt-tabs', role: 'tablist' },
            attempts.map((a, i) => e('button', {
              key: i, role: 'tab', 'aria-selected': i === selAtt,
              className: 'attempt-tab' + (i === selAtt ? ' on' : ''), onClick: () => setSelAttempt(i),
              title: 'Attempt ' + (i + 1) + ' — ' + a.status,
            },
              e(Dot, { status: a.status }),
              e('span', { className: 'at-n' }, 'Attempt ' + (i + 1)),
              a.duration_sec != null ? e('span', { className: 'at-dur' }, fmtSpan(a.duration_sec))
                : a.status === 'running' ? e('span', { className: 'at-dur t-run' }, 'running') : null))),

          // info / logs / parameters tab strip
          e('div', { className: 'tp-tabs', role: 'tablist' },
            e('button', { role: 'tab', 'aria-selected': detailTab === 'meta', className: 'tp-tab' + (detailTab === 'meta' ? ' on' : ''), onClick: () => setDetailTab('meta') },
              e(Icon, { name: 'info', size: 12 }), e('span', null, 'Info')),
            e('button', { role: 'tab', 'aria-selected': detailTab === 'logs', className: 'tp-tab' + (detailTab === 'logs' ? ' on' : ''), onClick: () => setDetailTab('logs') },
              e(Icon, { name: 'terminal', size: 12 }), e('span', null, 'Logs')),
            e('button', { role: 'tab', 'aria-selected': detailTab === 'params', className: 'tp-tab' + (detailTab === 'params' ? ' on' : ''), onClick: () => setDetailTab('params') },
              e(Icon, { name: 'sliders', size: 12 }), e('span', null, 'Parameters'),
              params.length ? e('span', { className: 'tp-tab-count' }, params.length) : null),
            e('span', { className: 'spacer' }),
            detailTab === 'logs' && attempts.length > 1 && e('span', { className: 'term-attempt' }, 'Attempt ' + (selAtt + 1) + ' / ' + attempts.length)),

          // info body
          detailTab === 'meta' && e('div', { className: 'tp-params' },
            metaCells.map(c => e('div', { key: c.label, className: 'rp-row' },
              e('span', { className: 'rp-k', title: c.label }, c.label),
              e('span', { className: 'rp-v' + (c.tone ? ' t-' + c.tone : ''), title: String(c.value) }, c.value)))),

          // parameters body
          detailTab === 'params' && e('div', { className: 'tp-params' },
            params.length
              ? params.map(p => e('div', { key: p.k, className: 'rp-row' },
                  e('span', { className: 'rp-k', title: p.k }, p.k,
                    p.added ? e('span', { style: { marginLeft: 7, fontSize: 9.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--accent)', background: 'var(--accent-dim)', borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle' } }, 'added') : null),
                  e('span', { className: 'rp-v', title: String(p.v) }, p.v === '' ? '' : p.v)))
              : e('div', { className: 'tp-params-empty' }, 'This task takes no parameters.')),

          // logs body
          detailTab === 'logs' && e('div', { className: 'tp-logs' },
            e('div', { className: 'step-logs' },
              (!att || (att.steps || []).length === 0)
                ? e('div', { className: 'log-ln dim', style: { padding: '12px 14px' } }, e('span', { className: 'msg' }, '// no steps'))
                : att.steps.map((sc, i) => {
                    const open = i === selStep
                    const lines = sc.log_id ? logCache[sc.log_id] : null
                    return e('div', { key: i, className: 'step-log' + (open ? ' open' : '') },
                      e('button', { className: 'sl-head', onClick: () => { const willOpen = !open; setSelStep(willOpen ? i : -1); if (willOpen) loadLog(sc.log_id) } },
                        e(Icon, { name: 'chevD', size: 14, style: { transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--tx-lo)', flex: 'none' } }),
                        e(Dot, { status: sc.status, pulse: sc.status === 'running' }),
                        e('span', { className: 'sl-name' }, sc.name),
                        e('span', { className: 'sl-status' }, sc.status)),
                      open && e('div', { className: 'term-body' },
                        lines == null
                          ? e('div', { className: 'log-ln dim' }, e('span', { className: 'msg' }, (sc.status === 'skipped' || sc.status === 'queued') ? '// ' + sc.name + ' — did not run' : 'Loading…'))
                          : lines.length === 0
                          ? e('div', { className: 'log-ln dim' }, e('span', { className: 'msg' }, '// ' + sc.name + ' — no output'))
                          : lines.map((l, i2) => e('div', { key: i2, className: 'log-ln ' + lineCls(l.stream) },
                              e('span', { className: 'ts' }, l.ts ? fmtClockTime(l.ts) : ''),
                              e('span', { className: 'msg' }, l.msg)))))
                  })))))))
}

function lineCls(stream) {
  return stream === 'stderr' ? 'err' : stream === 'system' ? 'dim' : ''
}

// The per-task resolved params the selected task ran with (TaskOutcome.params),
// flagging any key the task's env doesn't declare as an ad-hoc "added" param.
function paramsForTask(task) {
  if (!task) return []
  const params = task.params || {}
  const added = new Set(task.added_params || [])
  return Object.keys(params).map(k => ({ k, v: params[k], added: added.has(k) }))
}

export function RunDetailPage({ ctx }) {
  return e('div', { className: 'page page-wide fadein' }, e(RunDetail, { runId: ctx.state.runId, ctx }))
}

export const RunsUI = { RunRow, Pager, RUN_COLS, PAGE_SIZE }
