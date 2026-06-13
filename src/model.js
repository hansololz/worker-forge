/* ============================================================
   Data model: load workflows + tasks from the backend (SPEC §6) and shape
   them into the structures the ported design views expect. Mutations route
   through the API, then reload. A tiny subscribe()/revision lets React
   re-render after a reload.
   ============================================================ */
import { api } from './api'

export const DB = {
  WF: [],          // design-shaped workflows (full: stages, params, exec, versions)
  TASKS: [],       // design-shaped tasks (full: env, steps, history)
  taskById: {},    // id -> full latest task
  settings: null,
  loaded: false,
}

let revision = 0
const subs = new Set()
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn) }
export function getRevision() { return revision }
function bump() { revision++; subs.forEach(fn => fn()) }

// Optimistically merge a settings patch into the shared DB and re-render, so
// changing the display timezone updates every rendered timestamp immediately.
export function applySettingsPatch(p) {
  DB.settings = { ...(DB.settings || {}), ...p }
  bump()
}

// ---- formatting helpers (shared with views) -----------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ---- display timezone (user-selected, SPEC §General) --------------------
// Backend stores all timestamps in UTC; the UI renders them in the zone the
// user picked in Settings. settings.timezone is a real IANA zone name like
// "America/Los_Angeles", "Europe/London", "Asia/Kolkata", or "UTC". We compute
// each timestamp's offset for its own instant via Intl, so daylight saving is
// applied correctly worldwide (BST/PDT in summer, southern-hemisphere reversal,
// half-hour and 45-minute zones, zones that recently changed their DST rules).
// Resolve settings.timezone to an IANA zone name (or null if undeterminable).
function tzZone() {
  const s = ((DB.settings && DB.settings.timezone) || '').trim()
  if (s) return s // an explicit IANA name (Intl validates / throws below)
  // No explicit choice — fall back to the user's current machine time zone, so
  // timestamps render in local time by default rather than UTC.
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}
// Short, DST-aware zone tag for the instant (e.g. "PDT", "GMT+5:45", "UTC"),
// appended to timestamp column headers so the rendered local times are unambiguous.
export function tzShort(iso) {
  try {
    const d = iso ? new Date(iso) : new Date()
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tzZone() || 'UTC', timeZoneName: 'short' }).formatToParts(d)
    const tn = parts.find(p => p.type === 'timeZoneName')
    return tn ? tn.value : 'UTC'
  } catch { return 'UTC' }
}
// Signed minute offset (east of UTC) for the display zone *at instant `iso`*,
// so DST is applied correctly. Falls back to UTC (0) when undeterminable.
function tzOffsetMin(iso) {
  const zone = tzZone()
  if (zone) {
    try {
      const d = iso ? new Date(iso) : new Date()
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
      const p = {}
      for (const part of dtf.formatToParts(d)) p[part.type] = part.value
      let h = Number(p.hour); if (h === 24) h = 0
      const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second)
      return Math.round((asUTC - d.getTime()) / 60000)
    } catch { /* fall through to UTC */ }
  }
  return 0
}
// A Date shifted so its getUTC* fields read as wall-clock in the display zone.
export function tzDate(iso) { return new Date(new Date(iso).getTime() + tzOffsetMin(iso) * 60000) }

export function fmtShortDate(iso) {
  if (!iso) return ''
  const d = tzDate(iso)
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`
}
export function fmtDurSec(s) {
  if (s == null) return '—'
  s = Math.round(s)
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}
export function fmtAgeIso(iso) {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}
// Canonical timestamp: numeric, zero-padded, year→seconds order — e.g.
// "2026-06-16 09:14:09". Rendered in the user's display zone (see tzDate /
// tzZone), which defaults to the machine's local zone. opts.seconds === false
// drops :SS.
export function fmtStamp(iso, opts) {
  if (!iso) return '—'
  opts = opts || {}
  const d = tzDate(iso)
  const p = (n) => String(n).padStart(2, '0')
  const clock = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` + (opts.seconds === false ? '' : `:${p(d.getUTCSeconds())}`)
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${clock}`
}

// Next time a 5-field cron expression fires at/after `fromSec`, in epoch seconds
// — brute-forced minute-by-minute, fields evaluated in UTC (how schedules are
// authored). Used for a live next-run preview in the triggers editor, where the
// edited cron has no backend-computed next_at yet. Returns null if the
// expression is malformed or nothing matches within a year.
export function nextCronRun(cron, fromSec) {
  const parts = (cron || '').trim().split(/\s+/)
  if (parts.length !== 5) return null
  const RANGE = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
  const matches = (field, idx, val) => {
    if (field === '*') return true
    return field.split(',').some(part => {
      let step = 1, base = part
      const slash = part.indexOf('/')
      if (slash !== -1) { base = part.slice(0, slash); step = +part.slice(slash + 1) || 1 }
      let lo, hi
      if (base === '*' || base === '') { [lo, hi] = RANGE[idx] }
      else if (base.indexOf('-') !== -1) { const b = base.split('-'); lo = +b[0]; hi = +b[1] }
      else { lo = hi = +base }
      if (isNaN(lo) || isNaN(hi)) return false
      for (let x = lo; x <= hi; x += step) {
        const xx = idx === 4 ? x % 7 : x   // cron weekday 7 == Sunday == 0
        if (xx === val) return true
      }
      return false
    })
  }
  const domRestricted = parts[2] !== '*', dowRestricted = parts[4] !== '*'
  let t = (Math.floor(fromSec / 60) + 1) * 60   // start from the next whole minute
  const cap = t + 366 * 86400
  for (; t <= cap; t += 60) {
    const d = new Date(t * 1000)
    if (!matches(parts[0], 0, d.getUTCMinutes())) continue
    if (!matches(parts[1], 1, d.getUTCHours())) continue
    if (!matches(parts[3], 3, d.getUTCMonth() + 1)) continue
    const domOk = matches(parts[2], 2, d.getUTCDate())
    const dowOk = matches(parts[4], 4, d.getUTCDay())
    // standard cron: when BOTH day-of-month and day-of-week are restricted the
    // rule fires if EITHER matches; otherwise both must match.
    const dayOk = (domRestricted && dowRestricted) ? (domOk || dowOk) : (domOk && dowOk)
    if (dayOk) return t
  }
  return null
}

// ---- backend → design shape mappers -------------------------------------
function mapTaskVersion(ver) {
  // backend env {key,default,required} -> design {k,v,required}
  // backend step {name,description,lang,code} -> design {name,desc,code,lang}
  return {
    id: ver.id,
    name: ver.name,
    desc: ver.description || '',
    icon: ver.icon || 'box',
    category: ver.category || 'ops',
    interpreter: ver.interpreter || 'bash',
    timeout: ver.timeout_sec != null ? ver.timeout_sec : null,
    retries: ver.retries || 0,
    env: (ver.env || []).map(p => ({ k: p.key, v: p.default || '', required: !!p.required })),
    steps: (ver.steps || []).map(s => ({ name: s.name, desc: s.description || '', code: s.code || '', lang: s.lang || 'bash' })),
    version: ver.version,
    savedAt: fmtShortDate(ver.created_at),
  }
}

// design stage shape: a stage is a taskId string (single) or array of ids (parallel)
function mapStages(stages) {
  return (stages || []).map(st => {
    const ids = (st.tasks || []).map(t => t.task_id)
    return ids.length === 1 ? ids[0] : ids
  })
}
function mapRefParams(stages) {
  const params = {}        // {taskId: {KEY: val}}
  const exec = {}          // {taskId: {continueOnFailure, version, retries, timeoutMin}}
  ;(stages || []).forEach(st => (st.tasks || []).forEach(t => {
    if (t.params && Object.keys(t.params).length) params[t.task_id] = { ...t.params }
    exec[t.task_id] = {
      continueOnFailure: !!t.continue_on_failure,
      version: t.task_version == null ? 'latest' : t.task_version,
      enabled: t.enabled !== false,
    }
  }))
  return { params, exec }
}

function mapWorkflowVersionData(ver) {
  const { params, exec } = mapRefParams(ver.stages)
  return {
    version: ver.version,
    savedAt: fmtShortDate(ver.created_at),
    name: ver.name,
    desc: ver.description || '',
    stages: mapStages(ver.stages),
    wfParams: ver.params ? { ...ver.params } : {},
    params,
    exec,
  }
}

function scheduleFromTriggers(triggers) {
  const cron = (triggers || []).find(t => t.type === 'cron' && t.enabled)
  if (!cron) return { type: 'manual', cron: null, next: null, nextAt: null }
  return {
    type: 'cron',
    cron: cron.cron,
    // canonical UTC timestamp of the real next fire (backend croniter), shown as
    // the secondary line; the live "in …" countdown to nextAt is the primary line.
    next: cron.next_at ? fmtStamp(cron.next_at) : null,
    nextAt: cron.next_at || null,
  }
}

function lastStatusToAgg(le) {
  if (!le) return 'skip'
  if (le.status === 'succeeded') return 'ok'
  if (le.status === 'failed') return 'fail'
  return le.status
}

// ---- full load ----------------------------------------------------------
export async function loadAll() {
  const [taskList, wfList, settings] = await Promise.all([
    api.listTasks(), api.listWorkflows(), api.getSettings().catch(() => null),
  ])

  // Tasks: fetch each task's versions (current + history) for the editor pickers.
  const tasks = await Promise.all(taskList.map(async (meta) => {
    const detail = await api.getTask(meta.id)
    const verNums = (detail.versions || [meta.latest_version]).slice().sort((a, b) => b - a)
    const vers = await Promise.all(verNums.map(n => api.getTaskVersion(meta.id, n)))
    const byNum = {}
    vers.forEach(v => { byNum[v.version] = mapTaskVersion(v) })
    const cur = byNum[meta.latest_version] || mapTaskVersion(vers[0])
    const history = verNums.filter(n => n !== meta.latest_version).map(n => byNum[n])
    return { ...cur, usedBy: meta.used_by != null ? meta.used_by : (detail.used_by || 0), history }
  }))
  const taskById = Object.fromEntries(tasks.map(t => [t.id, t]))

  // Workflows: fetch each workflow's versions for stages/params/version picker.
  const wfs = await Promise.all(wfList.map(async (li) => {
    const detail = await api.getWorkflow(li.id)
    const verNums = (detail.versions || [li.latest_version]).slice().sort((a, b) => b - a)
    const vers = await Promise.all(verNums.map(n => api.getWorkflowVersion(li.id, n)))
    const byNum = {}
    vers.forEach(v => { byNum[v.version] = mapWorkflowVersionData(v) })
    const cur = byNum[li.latest_version] || mapWorkflowVersionData(vers[0])
    const verHistory = verNums.filter(n => n !== li.latest_version).map(n => byNum[n])
    const triggers = (detail.triggers || []).map(t => ({ id: t.id, type: t.type, enabled: t.enabled, cron: t.cron }))
    const schedule = scheduleFromTriggers(detail.triggers)
    const le = li.last_execution
    return {
      id: li.id,
      name: cur.name,
      desc: cur.desc,
      stages: cur.stages,
      wfParams: cur.wfParams,
      params: cur.params,
      exec: cur.exec,
      triggers,
      schedule,
      lastRun: le && le.started_at ? fmtAgeIso(le.started_at) : 'never',
      lastRunAt: le && le.started_at ? fmtStamp(le.started_at) + ' ' + tzShort(le.started_at) : null,
      lastStatus: lastStatusToAgg(le),
      version: li.latest_version,
      savedAt: fmtShortDate(detail.updated_at),
      verHistory,
    }
  }))

  DB.TASKS = tasks
  DB.taskById = taskById
  DB.WF = wfs
  DB.settings = settings
  DB.loaded = true
  bump()
}

// ---- design → backend save mappers --------------------------------------
// Map the editor's trigger list to the version-save body. Returns undefined when
// the draft has no triggers field, which tells the backend to carry the prior
// version's triggers forward. New triggers keep their client-temp "t_*" ids; the
// backend mints real ids for those.
function triggersToBackend(triggers) {
  if (!triggers) return undefined
  return triggers.map(t => ({ id: t.id, type: t.type, cron: t.cron, enabled: t.enabled !== false }))
}

function stagesToBackend(draftStages, draftExec, draftParams) {
  const norm = (draftStages || []).map(s => Array.isArray(s) ? s : [s]).filter(s => s.length > 0)
  return norm.map(ids => ({
    tasks: ids.map(taskId => {
      const ex = (draftExec && draftExec[taskId]) || {}
      // null persists "always latest" — the backend resolves it to the current
      // version on each run. A concrete pin is stored as its number.
      const version = ex.version === 'latest' || ex.version == null
        ? null
        : Number(ex.version)
      const p = (draftParams && draftParams[taskId]) || {}
      const params = {}
      Object.keys(p).forEach(k => { if (p[k] !== undefined && p[k] !== '') params[k] = p[k] })
      return {
        task_id: taskId,
        task_version: version,
        enabled: ex.enabled !== false,
        continue_on_failure: !!ex.continueOnFailure,
        params,
      }
    }),
  }))
}

function taskDraftToBody(draft) {
  return {
    name: (draft.name || '').trim(),
    description: draft.desc || null,
    icon: draft.icon || 'box',
    category: draft.category || 'ops',
    interpreter: draft.interpreter || 'bash',
    retries: draft.retries || 0,
    timeout_sec: (draft.timeout === '' || draft.timeout == null) ? null : Number(draft.timeout),
    env: (draft.env || [])
      .filter(r => (r.k || '').trim() !== '')
      .map(r => ({ key: r.k.trim(), default: r.v || '', required: !!r.required })),
    steps: (draft.steps || []).map(s => ({
      name: s.name, description: s.desc || null, lang: s.lang || 'bash', code: s.code || '',
    })),
  }
}

// ---- mutation actions ---------------------------------------------------
export const actions = {
  async createWorkflow(draft) {
    // Seed the whole definition (stages + params + triggers) into the create
    // call so the new workflow's first saved definition is VERSION 1 — not an
    // empty v1 shell followed by a v2 with the content.
    const meta = await api.createWorkflow({
      name: (draft.name || '').trim() || 'untitled-workflow',
      description: draft.desc || null,
      params: draft.wfParams || {},
      stages: stagesToBackend(draft.stages, draft.exec, draft.params),
      triggers: triggersToBackend(draft.triggers) || [],
    })
    await loadAll()
    return meta.id
  },
  async saveWorkflow(draft) {
    // Stages, params and triggers are written together as a SINGLE version.
    // (Previously triggers were reconciled via separate /triggers calls, each of
    // which minted its own version — so one Save could bump the version twice.)
    const body = {
      name: (draft.name || '').trim(),
      description: draft.desc || null,
      params: draft.wfParams || {},
      stages: stagesToBackend(draft.stages, draft.exec, draft.params),
      triggers: triggersToBackend(draft.triggers),
    }
    await api.saveWorkflowVersion(draft.id, body)
    await loadAll()
  },
  async deleteWorkflow(id) { await api.deleteWorkflow(id); await loadAll() },
  async saveTask(draft) {
    const body = taskDraftToBody(draft)
    let id = draft.id
    if (draft.id === '__new') { const created = await api.createTask(body); id = (created && created.id) || id }
    else await api.saveTaskVersion(draft.id, body)
    await loadAll()
    return id
  },
  async deleteTask(id) { await api.deleteTask(id); await loadAll() },
  async saveTriggers(wfId, triggers) {
    // Save triggers the same way the workflow editor does: fold the new trigger
    // list into ONE workflow version (carrying the current stages/params/name
    // forward), instead of per-trigger create/patch/delete calls that each minted
    // their own version. One logical edit → one version.
    const wf = DB.WF.find(w => w.id === wfId)
    if (!wf) return
    await api.saveWorkflowVersion(wfId, {
      name: wf.name,
      description: wf.desc || null,
      params: wf.wfParams || {},
      stages: stagesToBackend(wf.stages, wf.exec, wf.params),
      triggers: triggersToBackend(triggers),
    })
    await loadAll()
  },
  async launchRun(wfId, version, taskParams) {
    // taskParams is the per-slot map {slotIdx: {KEY: value}}; sent as
    // task_params so the backend isolates env vars per task occurrence (SPEC §6.5).
    return api.launchExecution({ workflow_id: wfId, workflow_version: version, task_params: taskParams })
  },
}
