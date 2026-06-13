/* ============================================================
   Icons (Font Awesome 6 Free, inline SVG) + shared UI primitives.
   ============================================================ */
import React from 'react'
import { createPortal } from 'react-dom'
import { library, icon as faIcon } from '@fortawesome/fontawesome-svg-core'
import {
  faLayerGroup, faCube, faHammer, faGear, faMagnifyingGlass, faPlay, faForwardStep,
  faPlus, faMinus, faChevronRight, faChevronDown, faEllipsis, faXmark, faLink,
  faCircleInfo, faClockRotateLeft, faCheck, faCircleExclamation, faBolt, faTerminal,
  faArrowsRotate, faCodeBranch, faBox, faFlask, faShieldHalved, faRocket, faDatabase,
  faWandMagicSparkles, faBrain, faRobot, faCloud, faCode, faSliders, faFolderOpen,
} from '@fortawesome/free-solid-svg-icons'
import {
  faClock, faPenToSquare, faTrashCan, faCopy, faCalendar, faBell,
  faFolderOpen as faFolderOpenReg,
} from '@fortawesome/free-regular-svg-icons'
import { faAndroid, faGithub } from '@fortawesome/free-brands-svg-icons'

export const e = React.createElement

library.add(
  faLayerGroup, faCube, faHammer, faGear, faMagnifyingGlass, faPlay, faForwardStep,
  faPlus, faMinus, faChevronRight, faChevronDown, faEllipsis, faXmark, faLink,
  faCircleInfo, faClockRotateLeft, faCheck, faCircleExclamation, faBolt, faTerminal,
  faArrowsRotate, faCodeBranch, faBox, faFlask, faShieldHalved, faRocket, faDatabase,
  faWandMagicSparkles, faBrain, faRobot, faCloud, faCode, faSliders, faFolderOpen,
  faClock, faPenToSquare, faTrashCan, faCopy, faCalendar, faBell, faAndroid, faGithub,
  faFolderOpenReg,
)

// app-internal name -> [prefix, iconName]
const FA = {
  // nav + chrome
  workflows: ['fas', 'layer-group'],
  tasks: ['fas', 'cube'],
  hammer: ['fas', 'hammer'],
  schedules: ['far', 'clock'],
  settings: ['fas', 'gear'],
  search: ['fas', 'magnifying-glass'],
  folder: ['fas', 'folder-open'],
  folderOpen: ['far', 'folder-open'],

  // actions / controls
  play: ['fas', 'play'],
  skip: ['fas', 'forward-step'],
  plus: ['fas', 'plus'],
  minus: ['fas', 'minus'],
  chevR: ['fas', 'chevron-right'],
  chevD: ['fas', 'chevron-down'],
  dots: ['fas', 'ellipsis'],
  x: ['fas', 'xmark'],
  edit: ['far', 'pen-to-square'],
  trash: ['far', 'trash-can'],
  copy: ['far', 'copy'],
  link: ['fas', 'link'],

  // status / meta
  clock: ['far', 'clock'],
  info: ['fas', 'circle-info'],
  calendar: ['far', 'calendar'],
  history: ['fas', 'clock-rotate-left'],
  bell: ['far', 'bell'],
  check: ['fas', 'check'],
  alert: ['fas', 'circle-exclamation'],
  bolt: ['fas', 'bolt'],
  terminal: ['fas', 'terminal'],
  sync: ['fas', 'arrows-rotate'],

  // task-type glyphs
  git: ['fas', 'code-branch'],
  package: ['fas', 'box'],
  box: ['fas', 'cube'],
  flask: ['fas', 'flask'],
  shield: ['fas', 'shield-halved'],
  rocket: ['fas', 'rocket'],
  db: ['fas', 'database'],
  ai: ['fas', 'wand-magic-sparkles'],
  brain: ['fas', 'brain'],
  agent: ['fas', 'robot'],
  android: ['fab', 'android'],
  github: ['fab', 'github'],
  cloud: ['fas', 'cloud'],
  code: ['fas', 'code'],
  sliders: ['fas', 'sliders'],
}

const _iconCache = {}
function faHtml(prefix, iconName) {
  const key = prefix + ':' + iconName
  if (key in _iconCache) return _iconCache[key]
  let html = ''
  const res = faIcon({ prefix, iconName })
  if (res && res.html && res.html[0]) html = res.html[0]
  if (html) _iconCache[key] = html
  return html
}

export function Icon({ name, size = 16, className, style }) {
  const def = FA[name] || FA.workflows
  const html = faHtml(def[0], def[1])
  return e('span', {
    className: 'fa-icon' + (className ? ' ' + className : ''),
    'aria-hidden': 'true',
    style: { fontSize: size, width: size, height: size, ...style },
    dangerouslySetInnerHTML: { __html: html },
  })
}

// status meta — canonical statuses + run-level aliases
export const STATUS = {
  running: { cls: 'st-run', label: 'running', dot: 'st-run' },
  failed: { cls: 'st-fail', label: 'failed', dot: 'st-fail' },
  succeeded: { cls: 'st-ok', label: 'succeeded', dot: 'st-ok' },
  cancelled: { cls: 'st-cancel', label: 'cancelled', dot: 'st-cancel' },
  interrupted: { cls: 'st-interrupt', label: 'interrupted', dot: 'st-interrupt' },
  skipped: { cls: 'st-skip', label: 'skipped', dot: 'st-skip' },
  ok: { cls: 'st-ok', label: 'success', dot: 'st-ok' },
  fail: { cls: 'st-fail', label: 'failed', dot: 'st-fail' },
  queued: { cls: 'st-queued', label: 'queued', dot: 'st-queued' },
  continued: { cls: 'st-cont', label: 'continued', dot: 'st-cont' },
  skip: { cls: 'st-skip', label: 'idle', dot: 'st-skip' },
}

export function Badge({ status, children, pulse, noDot }) {
  const m = STATUS[status] || STATUS.skip
  return e('span', { className: 'badge ' + m.cls },
    !noDot && e('span', { className: 'dot ' + m.dot + (pulse ? ' pulse ring' : '') }),
    children || m.label)
}

export function Dot({ status, pulse }) {
  const m = STATUS[status] || STATUS.skip
  return e('span', { className: 'dot ' + m.dot + (pulse ? ' pulse' : '') })
}

export function Btn({ variant, size, icon, iconR, children, className = '', ...rest }) {
  const cls = ['btn',
    variant === 'primary' ? 'btn-primary' : variant === 'ghost' ? 'btn-ghost' : variant === 'danger' ? 'btn-danger' : '',
    size === 'sm' ? 'sm' : '',
    !children ? 'icon' : '', className].filter(Boolean).join(' ')
  return e('button', { className: cls, ...rest },
    icon && e(Icon, { name: icon, size: size === 'sm' ? 14 : 15 }),
    children,
    iconR && e(Icon, { name: iconR, size: 14 }))
}

// very small bash syntax highlighter -> array of React spans
function highlightBash(code) {
  const lines = code.split('\n')
  return lines.map((ln, i) => {
    const segs = []
    let rest = ln
    const cm = rest.match(/(^|\s)(#.*)$/)
    let comment = null
    if (cm && !/['"][^'"]*#/.test(rest)) {
      comment = cm[2]; rest = rest.slice(0, rest.length - comment.length)
    }
    const tokens = rest.split(/(\s+|"[^"]*"|\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*)/g).filter(t => t !== '' && t !== undefined)
    tokens.forEach((t, j) => {
      let cls = null
      if (/^"[^"]*"$/.test(t)) cls = 'tok-str'
      else if (/^\$/.test(t)) cls = 'tok-var'
      else if (/^(set|if|then|fi|else|elif|for|do|done|while|echo|exit|cd|return|function|local|export|in)$/.test(t)) cls = 'tok-kw'
      else if (/^(git|npm|npx|docker|kubectl|curl|aws|jq|psql|pg_dump|trivy|gzip|date|sha256sum|du|sleep|cache|bc|cat|awk|read)$/.test(t)) cls = 'tok-fn'
      else if (/^(--?[A-Za-z][\w-]*)$/.test(t)) cls = 'tok-fl'
      segs.push(cls ? e('span', { key: j, className: cls }, t) : t)
    })
    if (comment) segs.push(e('span', { key: 'c', className: 'tok-cm' }, comment))
    return e('div', { key: i }, segs.length ? segs : ' ')
  })
}

const PY_KW = /^(def|class|return|if|elif|else|for|while|in|import|from|as|with|try|except|finally|raise|pass|break|continue|lambda|yield|and|or|not|is|None|True|False|async|await|global|nonlocal|assert|del)$/
const PY_BUILTIN = /^(print|len|range|open|int|str|float|bool|dict|list|set|tuple|sum|min|max|abs|sorted|enumerate|zip|map|filter|isinstance|type|format|join|split|append|items|keys|values|get|os|sys|json|re|subprocess|requests)$/
function highlightPython(code) {
  const lines = code.split('\n')
  return lines.map((ln, i) => {
    const segs = []
    const re = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#.*$|@\w+|\b\d+\.?\d*\b|\b\w+\b|\s+|[^\s\w]+)/g
    let m, j = 0
    while ((m = re.exec(ln)) !== null) {
      const t = m[0]
      let cls = null
      if (/^#/.test(t)) cls = 'tok-cm'
      else if (/^("|')/.test(t)) cls = 'tok-str'
      else if (/^@/.test(t)) cls = 'tok-fn'
      else if (/^\d/.test(t)) cls = 'tok-fl'
      else if (t === 'self' || t === 'cls') cls = 'tok-var'
      else if (PY_KW.test(t)) cls = 'tok-kw'
      else if (PY_BUILTIN.test(t)) cls = 'tok-fn'
      segs.push(cls ? e('span', { key: j, className: cls }, t) : t)
      j++
    }
    return e('div', { key: i }, segs.length ? segs : ' ')
  })
}

export function highlightCode(code, lang) {
  return (lang === 'python' || lang === 'py') ? highlightPython(code) : highlightBash(code)
}

// Shared confirmation modal — one consistent destructive-action prompt across
// the app (delete workflow, cancel a run). Controlled: render only while open.
// `message` may be a string or nodes (e.g. a <b> name). tone: 'danger' (red,
// default) or 'warn' (amber) for reversible-but-disruptive actions.
export function ConfirmModal({ icon = 'trash', tone = 'danger', title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onClose }) {
  const { useEffect } = React
  useEffect(() => {
    const onEsc = (ev) => { if (ev.key === 'Escape') onClose && onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])
  const danger = tone !== 'warn'
  return createPortal(
    e(React.Fragment, null,
      e('div', { className: 'scrim', onClick: onClose }),
      e('div', { className: 'modal', onClick: onClose },
        e('div', { className: 'modal-card', onClick: ev => ev.stopPropagation() },
          e('div', { className: 'modal-icon' + (danger ? '' : ' warn') }, e(Icon, { name: icon, size: 18 })),
          e('h3', { className: 'modal-title' }, title),
          e('p', { className: 'modal-msg' }, message),
          e('div', { className: 'modal-actions' },
            e('button', { className: 'btn btn-ghost', onClick: onClose }, cancelLabel),
            e('button', { className: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onClick: onConfirm }, confirmLabel))))),
    document.body)
}

// Shared custom <select> dropdown — one popover used everywhere a value is picked.
export function Select({ value, onChange, options = [], disabled, mono, block, align, minWidth, ariaLabel, btnStyle, style, search, searchPlaceholder }) {
  const { useState, useEffect, useRef } = React
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  const searchRef = useRef(null)
  useEffect(() => {
    if (!open) { setQ(''); return }
    const onDoc = (ev) => { if (ref.current && !ref.current.contains(ev.target)) setOpen(false) }
    const onKey = (ev) => { if (ev.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    if (search && searchRef.current) searchRef.current.focus()
    return () => { window.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey) }
  }, [open])
  const norm = options.map(o => (o && typeof o === 'object') ? o : { value: o, label: String(o) })
  const sel = norm.find(o => String(o.value) === String(value))
  // When searchable, filter on both the visible label and the raw value (e.g.
  // typing "kolkata" or "asia" matches the "Asia/Kolkata" zone).
  const ql = q.trim().toLowerCase()
  const shown = (search && ql)
    ? norm.filter(o => (o.label + ' ' + o.value).toLowerCase().includes(ql))
    : norm
  const wrapStyle = Object.assign(block ? { display: 'block', width: '100%' } : { display: 'inline-block' }, style || {})
  const btn = Object.assign(block ? { width: '100%' } : { width: 'auto', minWidth: minWidth || 116 }, btnStyle || {})
  return e('div', { className: 'dd', ref, style: wrapStyle },
    e('button', {
      type: 'button', disabled,
      className: 'select dd-btn' + (mono ? ' mono' : '') + (open ? ' open' : ''),
      'aria-label': ariaLabel, style: btn,
      onClick: () => { if (!disabled) setOpen(o => !o) },
    }, e('span', { className: 'dd-val' }, sel ? sel.label : (value != null ? String(value) : ''))),
    open && e('div', { className: 'dd-panel' + (block ? ' dd-block' : '') + (align === 'right' ? ' dd-right' : '') + (search ? ' dd-search' : '') },
      search && e('div', { className: 'dd-search-row' },
        e('input', {
          ref: searchRef, className: 'dd-search-input', type: 'text', value: q,
          placeholder: searchPlaceholder || 'Search…', 'aria-label': searchPlaceholder || 'Search',
          onChange: ev => setQ(ev.target.value),
        })),
      shown.length === 0 && e('div', { className: 'dd-empty' }, 'No matches'),
      shown.map(o => e('button', {
        key: String(o.value), type: 'button',
        className: 'dd-opt' + (String(o.value) === String(value) ? ' on' : ''),
        onClick: () => { onChange(o.value); setOpen(false) },
      },
        e('span', { className: 'dd-opt-l' + ((mono || o.mono) ? ' mono' : '') }, o.label),
        String(o.value) === String(value) && e(Icon, { name: 'check', size: 14 })))))
}
