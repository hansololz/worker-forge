/* ============================================================
   Settings — Data Directory (SPEC §8.8) + General.
   Data Directory card uses the same .card / .set-row primitives.
   ============================================================ */
import React from 'react'
import { e, Icon, Btn, Select as UISelect } from '../ui'
import { api } from '../api'
import { loadAll, applySettingsPatch } from '../model'

const { useState, useEffect } = React

// Timestamps are stored in UTC and rendered in the IANA zone chosen here.
// We offer the full canonical IANA list (Intl.supportedValuesOf) so every
// real-world zone — including DST, half-hour/45-min offsets, and southern-
// hemisphere zones — is selectable; the offset shown is DST-aware for "now".
function currentOffsetLabel(zone) {
  try {
    const parts = {}
    for (const p of new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date())) parts[p.type] = p.value
    let h = Number(parts.hour); if (h === 24) h = 0
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, h, +parts.minute, +parts.second)
    const off = Math.round((asUTC - Date.now()) / 60000)
    if (off === 0) return 'UTC'
    const a = Math.abs(off)
    return `UTC${off < 0 ? '−' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
  } catch { return '' }
}
const TZ_ZONES = (() => {
  const zones = Intl.supportedValuesOf('timeZone')
  return zones.includes('UTC') ? zones : ['UTC', ...zones]
})()
const TIMEZONES = TZ_ZONES.map(z => {
  const off = currentOffsetLabel(z)
  return { value: z, label: off && z !== 'UTC' ? `${z.replace(/_/g, ' ')} · ${off}` : z.replace(/_/g, ' ') }
})

function Card({ title, sub, action, children, flush }) {
  return e('div', { className: 'card' },
    e('div', { className: 'card-h' },
      e('h3', null, title),
      sub && e('span', { className: 'sub' }, sub),
      action && e('span', { style: { marginLeft: 'auto' } }, action)),
    flush ? children : e('div', { className: 'card-b' }, children))
}
function Row({ title, desc, toggle, children }) {
  return e('div', { className: 'set-row' },
    e('div', { className: 'lbl' },
      e('div', { className: 't' }, title),
      desc && e('div', { className: 'd' }, desc)),
    e('div', { className: 'ctl' + (toggle ? ' toggle-ctl' : '') }, children))
}
function Toggle({ on, onClick }) {
  return e('button', { className: 'toggle' + (on ? ' on' : ''), onClick, role: 'switch', 'aria-checked': on })
}
function Select(props) { return e(UISelect, Object.assign({ block: true }, props)) }

// About card — outbound link + footer credit.
const REPO_URL = 'https://github.com/hansololz/worker-forge'
function About() {
  function openLink(ev, href) {
    ev.preventDefault()
    if (window.backend && window.backend.openExternal) window.backend.openExternal(href)
    else window.open(href, '_blank', 'noreferrer')
  }
  const links = [
    { label: 'View on GitHub', icon: 'github', href: REPO_URL },
  ]
  return e(Card, { title: 'About' },
    // Outbound link buttons. paddingTop gives the row top breathing room since
    // this card has no .set-rows to carry vertical rhythm.
    e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 14 } },
      links.map(l => e('a', { key: l.label, href: l.href, onClick: ev => openLink(ev, l.href),
        style: { display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px',
          border: '1px solid var(--line-soft)', borderRadius: 8, background: 'var(--bg-2)',
          fontSize: 12.5, fontWeight: 500, color: 'var(--tx-mid)', textDecoration: 'none' } },
        e(Icon, { name: l.icon, size: 13, style: { color: 'var(--tx-lo)' } }), l.label))),
    // Footer credit.
    e('div', { style: { marginTop: 16, paddingTop: 14, paddingBottom: 14, borderTop: '1px solid var(--line-soft)',
      fontSize: 11.5, color: 'var(--tx-dim)', lineHeight: 1.7 } },
      e('div', null, '© 2026 Worker Forge. All rights reserved.')))
}

export function SettingsView({ ctx }) {
  const [s, setS] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.getSettings().then(setS).catch(() => setS({ data_directory: '', timezone: 'UTC', launch_on_startup: true, keep_running_in_background: true, config_path: '', summary: {} })) }, [])
  if (!s) return e('div', { className: 'page page-wide fadein' }, e('div', { className: 'empty' }, 'Loading…'))

  function patch(p) {
    setS(x => ({ ...x, ...p }))
    applySettingsPatch(p)   // re-render timestamps app-wide in the new zone
    api.patchSettings(p).catch(er => ctx.toast && ctx.toast(String(er)))
  }
  async function changeDataDirectory() {
    const picked = window.backend && window.backend.openDirectory ? await window.backend.openDirectory() : null
    if (!picked) return
    setBusy(true)
    try {
      const next = await api.setDataDirectory(picked)
      setS(next)
      await loadAll()
      ctx.toast && ctx.toast('Data directory changed')
    } catch (er) { ctx.toast && ctx.toast(String(er)) }
    setBusy(false)
  }
  // Execution history can live outside the data directory. executions_path is the
  // root holding the executions/ subfolder; effective root = data dir unless separate.
  const execSeparate = !!s.executions_separate
  const effectiveExecPath = execSeparate ? s.executions_path : s.data_directory
  async function toggleExecSeparate() {
    setBusy(true)
    try {
      const next = await api.patchSettings({ executions_separate: !execSeparate })
      setS(next)
      await loadAll()   // index was reconciled against the new executions root
    } catch (er) { ctx.toast && ctx.toast(String(er)) }
    setBusy(false)
  }
  async function changeExecPath() {
    const picked = window.backend && window.backend.openDirectory ? await window.backend.openDirectory() : null
    if (!picked) return
    setBusy(true)
    try {
      const next = await api.setExecutionsPath(picked)
      setS(next)
      await loadAll()
      ctx.toast && ctx.toast('Execution history location changed')
    } catch (er) { ctx.toast && ctx.toast(String(er)) }
    setBusy(false)
  }
  // $WORKSPACE — where each execution checks out repos and does its work. workspace_path
  // is the root holding the workspace/ subfolder; effective root = data dir unless separate.
  const wsSeparate = !!s.workspace_separate
  const effectiveWsPath = wsSeparate ? s.workspace_path : s.data_directory
  async function toggleWsSeparate() {
    setBusy(true)
    try {
      const next = await api.patchSettings({ workspace_separate: !wsSeparate })
      setS(next)
    } catch (er) { ctx.toast && ctx.toast(String(er)) }
    setBusy(false)
  }
  async function changeWsPath() {
    const picked = window.backend && window.backend.openDirectory ? await window.backend.openDirectory() : null
    if (!picked) return
    setBusy(true)
    try {
      const next = await api.setWorkspacePath(picked)
      setS(next)
      ctx.toast && ctx.toast('Workspace location changed')
    } catch (er) { ctx.toast && ctx.toast(String(er)) }
    setBusy(false)
  }


  return e('div', { className: 'page page-wide fadein' },
    e('div', { className: 'ph' },
      e('div', null,
        e('h1', null, 'Settings'),
        e('p', null, 'All changes are saved automatically.'))),

    e('div', { className: 'settings-col', style: { maxWidth: 'none' } },
      // Data Directory card (SPEC §8.8)
      e(Card, { title: 'Data Directory' },
        // Workflows + tasks live in the data directory folder.
        e('div', { className: 'ws-row' },
          e('div', { className: 'lbl' },
            e('div', { className: 'd' }, 'Workflows and tasks. Use a synced or version-controlled folder to share across machines.')),
          e('div', { className: 'ws-field' },
            e(Icon, { name: 'folderOpen', size: 15 }),
            e('span', { className: 'ws-path', title: s.data_directory }, s.data_directory || '—'),
            e(Btn, { variant: 'ghost', size: 'sm', icon: 'folder', onClick: changeDataDirectory, disabled: busy }, busy ? 'Working…' : 'Change'))),
        // Execution history — optionally stored at a separate location.
        e('div', { className: 'ws-row' },
          e('div', { className: 'ws-row-h' },
            e('div', { className: 'lbl' },
              e('div', { className: 'd' }, 'Workflow exections; outputs and step logs.')),
            e('div', { className: 'ws-row-toggle' },
              e('span', { className: 'ws-toggle-lbl' }, 'Separate location'),
              e(Toggle, { on: execSeparate, onClick: toggleExecSeparate }))),
          execSeparate
            ? e('div', { className: 'ws-field' },
                e(Icon, { name: 'folderOpen', size: 15 }),
                e('span', { className: 'ws-path', title: effectiveExecPath }, effectiveExecPath || '—'),
                e(Btn, { variant: 'ghost', size: 'sm', icon: 'folder', onClick: changeExecPath, disabled: busy }, busy ? 'Working…' : 'Change'))
            : e('div', { className: 'ws-field ws-field-muted' },
                e(Icon, { name: 'folderOpen', size: 15 }),
                e('span', { className: 'ws-path', title: effectiveExecPath }, effectiveExecPath || '—'),
                e(Btn, { variant: 'ghost', size: 'sm', icon: 'folder', disabled: true }, 'Change'))),
        // $WORKSPACE — per-execution working dir, optionally stored at a separate location.
        e('div', { className: 'ws-row' },
          e('div', { className: 'ws-row-h' },
            e('div', { className: 'lbl' },
              e('div', { className: 'd' }, 'Workspace directories.')),
            e('div', { className: 'ws-row-toggle' },
              e('span', { className: 'ws-toggle-lbl' }, 'Separate location'),
              e(Toggle, { on: wsSeparate, onClick: toggleWsSeparate }))),
          wsSeparate
            ? e('div', { className: 'ws-field' },
                e(Icon, { name: 'folderOpen', size: 15 }),
                e('span', { className: 'ws-path', title: effectiveWsPath }, effectiveWsPath || '—'),
                e(Btn, { variant: 'ghost', size: 'sm', icon: 'folder', onClick: changeWsPath, disabled: busy }, busy ? 'Working…' : 'Change'))
            : e('div', { className: 'ws-field ws-field-muted' },
                e(Icon, { name: 'folderOpen', size: 15 }),
                e('span', { className: 'ws-path', title: effectiveWsPath }, effectiveWsPath || '—'),
                e(Btn, { variant: 'ghost', size: 'sm', icon: 'folder', disabled: true }, 'Change'))),
        // App config lives OUTSIDE the data directory — per-user OS config dir.
        e('div', { className: 'ws-row' },
          e('div', { className: 'cfg-note' },
            e(Icon, { name: 'info', size: 14 }),
            e('div', { className: 'cn-m' },
              e('div', { className: 'cn-t' }, 'App settings are stored separately and not inside the data directory:'),
              e('div', { className: 'cn-p', title: s.config_path }, s.config_path || 'the per-user config directory'))))),

      // General card (design)
      e(Card, { title: 'General' },
        e(Row, { title: 'Time zone', desc: 'Schedules and timestamps are displayed in this zone.' },
          e(Select, { value: s.timezone, onChange: v => patch({ timezone: v }), options: TIMEZONES, search: true, searchPlaceholder: 'Search time zone…' })),
        e(Row, { title: 'Launch on startup', desc: 'Open Worker Forge automatically when this computer boots.', toggle: true },
          e(Toggle, { on: s.launch_on_startup, onClick: () => patch({ launch_on_startup: !s.launch_on_startup }) })),
        e(Row, { title: 'Keep running in background', desc: 'Keep running scheduled workflows after the window closes.', toggle: true },
          e(Toggle, { on: s.keep_running_in_background, onClick: () => patch({ keep_running_in_background: !s.keep_running_in_background }) }))),

      // About card (design)
      e(About)))
}
