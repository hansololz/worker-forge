/* ============================================================
   Triggers editor — a workflow owns a LIST of trigger rules (cron only).
   ============================================================ */
import React from 'react'
import { e, Icon, Btn } from '../ui'
import { fmtStamp, nextCronRun, tzShort } from '../model'

const { useState } = React

function rid(n) { let s = ''; const c = '0123456789abcdef'; for (let i = 0; i < (n || 6); i++) s += c[Math.floor(Math.random() * 16)]; return s }

const PRESETS = [
  { label: 'Every 5 min', cron: '*/5 * * * *' },
  { label: 'Every 15 min', cron: '*/15 * * * *' },
  { label: 'Every 30 min', cron: '*/30 * * * *' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Nightly 00:00', cron: '0 0 * * *' },
  { label: 'Daily 03:00', cron: '0 3 * * *' },
  { label: 'Weekdays 09:00', cron: '0 9 * * 1-5' },
  { label: 'Weekends 08:00', cron: '0 8 * * 6,0' },
  { label: 'Weekly · Mon', cron: '0 5 * * 1' },
]
function presetLabel(cron) { const p = PRESETS.find(p => p.cron === cron); return p ? p.label : null }
function describeCron(cron) {
  const map = {
    '*/5 * * * *': 'Runs every 5 minutes.',
    '*/15 * * * *': 'Runs every 15 minutes.',
    '*/30 * * * *': 'Runs every 30 minutes, on the hour and half-hour.',
    '0 * * * *': 'Runs once an hour, at minute 0.',
    '0 */6 * * *': 'Runs every 6 hours (00:00, 06:00, 12:00, 18:00 UTC).',
    '0 0 * * *': 'Runs every day at midnight UTC.',
    '0 3 * * *': 'Runs every day at 03:00 UTC.',
    '0 9 * * 1-5': 'Runs Monday–Friday at 09:00 UTC.',
    '0 8 * * 6,0': 'Runs Saturday & Sunday at 08:00 UTC.',
    '0 5 * * 1': 'Runs every Monday at 05:00 UTC.',
  }
  return map[cron] || 'Custom schedule — next run computed from the cron expression.'
}

const TRIGGER_TYPES = {
  cron: {
    icon: 'clock', label: 'Cron schedule', desc: 'Run on a recurring time-based schedule',
    make: () => ({ cron: '0 9 * * *' }),
    summary: (t) => presetLabel(t.cron) || t.cron,
  },
}

const CRON_RANGE = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
function validCronField(val, idx) {
  const v = (val || '').trim()
  if (v === '') return false
  if (v === '*') return true
  const [lo, hi] = CRON_RANGE[idx]
  const inRange = (s) => /^\d+$/.test(s) && +s >= lo && +s <= hi
  return v.split(',').every(part => {
    if (part === '') return false
    let base = part
    if (part.indexOf('/') !== -1) {
      const bits = part.split('/')
      if (bits.length !== 2 || !/^\d+$/.test(bits[1]) || +bits[1] < 1) return false
      base = bits[0]
    }
    if (base === '*') return true
    if (base.indexOf('-') !== -1) {
      const [a, b] = base.split('-')
      return inRange(a) && inRange(b) && +a <= +b
    }
    return inRange(base)
  })
}
function cronStringValid(cron) {
  const parts = (cron || '').trim().split(/\s+/)
  return parts.length === 5 && parts.every((p, i) => validCronField(p, i))
}

function CronBody({ t, onPatch }) {
  const parts = (t.cron || '0 9 * * *').split(' ')
  const labels = ['min', 'hour', 'day', 'month', 'weekday']
  const invalid = parts.map((p, i) => !validCronField(p, i))
  function setPart(i, v) { const p = [...parts]; p[i] = v || '*'; onPatch({ cron: p.join(' ') }) }
  return e('div', null,
    e('div', { className: 'cron-box' },
      parts.map((p, i) => e('div', { key: i, className: 'cron-cell' },
        e('input', { className: 'mono' + (invalid[i] ? ' invalid' : ''), value: p, 'aria-invalid': invalid[i], onChange: ev => setPart(i, ev.target.value) }),
        e('div', { className: 'lbl' }, labels[i])))),
    invalid.some(Boolean) && e('div', { className: 'field-err', style: { marginTop: 8 } },
      e(Icon, { name: 'alert', size: 13 }),
      'Invalid value in ' + labels.filter((_, i) => invalid[i]).join(', ') + '. Use a number, range (1-5), list (1,3,5), step (*/2) or *.'),
    e('div', { className: 'sched-card', style: { marginTop: 12 } },
      e('div', { className: 'tr-ic', style: { width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--accent-dim)', color: 'var(--accent)', flex: 'none' } }, e(Icon, { name: 'clock', size: 16 })),
      e('div', null,
        e('div', { style: { fontSize: 13, color: 'var(--tx-hi)', fontWeight: 500 } }, describeCron(t.cron)),
        e('div', { className: 'mono', style: { fontSize: 11.5, color: 'var(--tx-lo)', marginTop: 3 } },
          (() => { const nx = nextCronRun(t.cron, Math.floor(Date.now() / 1000)); if (nx == null) return 'Next run · —'; const iso = new Date(nx * 1000).toISOString(); return 'Next run · ' + fmtStamp(iso) + ' · ' + tzShort(iso) })()))),
    e('div', { style: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-dim)', fontWeight: 600, margin: '14px 0 8px' } }, 'Quick presets'),
    e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
      PRESETS.map(p => {
        const on = t.cron === p.cron
        return e('button', { key: p.cron, className: 'chip', style: { cursor: 'pointer', borderColor: on ? 'var(--accent-line)' : undefined, color: on ? 'var(--accent)' : undefined, background: on ? 'var(--accent-dim)' : undefined }, onClick: () => onPatch({ cron: p.cron }) }, p.label)
      })))
}

const BODIES = { cron: CronBody }

function TriggerCard({ t, ctx, onPatch, onToggle, onRemove }) {
  const meta = TRIGGER_TYPES[t.type]
  const Body = BODIES[t.type]
  return e('div', { className: 'card', style: { overflow: 'visible' } },
    e('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderBottom: t.enabled ? '1px solid var(--line-soft)' : 'none' } },
      e('div', { style: { width: 32, height: 32, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: 'var(--accent)', flex: 'none', opacity: t.enabled ? 1 : 0.5 } }, e(Icon, { name: meta.icon, size: 16 })),
      e('div', { style: { minWidth: 0, flex: 1, opacity: t.enabled ? 1 : 0.6 } },
        e('div', { style: { fontSize: 13.5, color: 'var(--tx-hi)', fontWeight: 600 } }, meta.label),
        e('div', { className: 'mono', style: { fontSize: 11.5, color: 'var(--tx-lo)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, meta.summary(t))),
      e('button', { className: 'toggle' + (t.enabled ? ' on' : ''), onClick: onToggle, role: 'switch', 'aria-checked': t.enabled, title: t.enabled ? 'Enabled' : 'Disabled' }),
      e('button', { className: 'btn icon sm btn-ghost', style: { color: 'var(--st-fail)' }, onClick: onRemove, title: 'Remove trigger' }, e(Icon, { name: 'trash', size: 15 }))),
    t.enabled && e('div', { className: 'card-b', style: { padding: 16 } }, e(Body, { t, onPatch, ctx })))
}

export function TriggersPanel({ triggers, setTriggers, ctx }) {
  function patch(id, p) { setTriggers(ts => ts.map(t => t.id === id ? { ...t, ...p } : t)) }
  function toggle(id) { setTriggers(ts => ts.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t)) }
  function remove(id) { setTriggers(ts => ts.filter(t => t.id !== id)) }
  function add(type) { setTriggers(ts => [...ts, { id: 't_' + rid(), type, enabled: true, ...TRIGGER_TYPES[type].make() }]) }
  const cronCount = triggers.filter(t => t.type === 'cron').length

  return e(React.Fragment, null,
    e('div', { style: { fontSize: 12.5, color: 'var(--tx-lo)', marginBottom: 16 } },
      'Define how this workflow starts. Each trigger fires independently — add as many as you need.',
      cronCount > 1 ? e('span', { style: { color: 'var(--tx-mid)' } }, '  ' + cronCount + ' cron schedules active.') : null),

    e('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
      triggers.length === 0 && e('div', { className: 'empty', style: { padding: '40px 10px', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-1)' } },
        e(Icon, { name: 'schedules', size: 24, style: { color: 'var(--tx-lo)' } }),
        e('div', { style: { marginTop: 10, color: 'var(--tx)', fontSize: 14 } }, 'No triggers'),
        e('div', { style: { fontSize: 12.5, marginTop: 4 } }, 'This workflow runs only when started manually or via the API.')),

      triggers.map(t => e(TriggerCard, { key: t.id, t, ctx, onPatch: p => patch(t.id, p), onToggle: () => toggle(t.id), onRemove: () => remove(t.id) })),

      e('button', { className: 'btn', style: { borderStyle: 'dashed', width: '100%', justifyContent: 'center', height: 40 }, onClick: () => add('cron') }, e(Icon, { name: 'plus', size: 15 }), 'Add cron schedule')))
}

export function TriggersEditor({ ctx }) {
  const w = ctx.workflows.find(x => x.id === ctx.state.workflowId)
  const [triggers, setTriggers] = useState(() => (w && w.triggers ? w.triggers.map(t => ({ ...t })) : []))
  if (!w) return e('div', { className: 'page' }, '—')
  function save() { ctx.saveTriggers(w, triggers) }
  const badCron = triggers.some(t => t.enabled && t.type === 'cron' && !cronStringValid(t.cron))

  return e('div', { className: 'page page-narrow fadein' },
    e('div', { className: 'ph', style: { alignItems: 'center' } },
      e('div', { style: { display: 'flex', alignItems: 'center', gap: 13, minWidth: 0, flex: 1 } },
        e('div', { style: { minWidth: 0 } },
          e('h1', { style: { margin: 0 } }, 'Triggers'),
          e('div', { style: { fontSize: 13, color: 'var(--tx-lo)' } }, 'workflow · ', e('span', { className: 'mono' }, w.name)))),
      e('div', { className: 'ph-actions' },
        e(Btn, { variant: 'ghost', onClick: () => ctx.nav({ view: 'workflow', workflowId: w.id }) }, 'Cancel'),
        e(Btn, { variant: 'primary', icon: 'check', onClick: save, disabled: badCron }, 'Save triggers'))),

    e(TriggersPanel, { triggers, setTriggers, ctx }))
}
