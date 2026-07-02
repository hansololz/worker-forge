import React from 'react'
import { Icon } from 'worker-forge'

const frame: React.CSSProperties = {
  background: 'var(--bg-1)', color: 'var(--tx)', padding: '26px 30px',
  borderRadius: '10px', minHeight: '72px',
}
const grid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
  gap: '18px 12px',
}
const cell: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px',
  color: 'var(--tx-mid)', fontFamily: 'var(--mono)', fontSize: '10.5px',
}

// The app's inline Font Awesome glyphs, addressed by short internal names.
// Colour follows `currentColor`, so icons inherit the surrounding text tone.
export function Gallery() {
  const names = [
    'play', 'sync', 'rocket', 'git', 'package', 'flask', 'shield', 'db',
    'terminal', 'bolt', 'clock', 'calendar', 'bell', 'edit', 'trash', 'copy',
    'settings', 'search', 'workflows', 'tasks', 'ai', 'agent', 'cloud', 'code',
  ]
  return (
    <div style={frame}>
      <div style={grid}>
        {names.map(n => (
          <span key={n} style={cell}>
            <Icon name={n} size={20} />
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}

// The same glyph across the size scale used in the UI (14–28px).
export function Sizes() {
  return (
    <div style={{ ...frame, display: 'flex', gap: '26px', alignItems: 'center' }}>
      {[14, 16, 20, 24, 28].map(s => (
        <span key={s} style={{ ...cell }}>
          <Icon name="rocket" size={s} />
          {s}px
        </span>
      ))}
    </div>
  )
}

// Accent-toned glyphs — pass a colour via `style` to tint an icon.
export function Tinted() {
  return (
    <div style={{ ...frame, display: 'flex', gap: '22px', alignItems: 'center' }}>
      <Icon name="check" size={22} style={{ color: 'var(--st-ok)' }} />
      <Icon name="alert" size={22} style={{ color: 'var(--st-fail)' }} />
      <Icon name="bolt" size={22} style={{ color: 'var(--accent)' }} />
      <Icon name="clock" size={22} style={{ color: 'var(--st-run)' }} />
    </div>
  )
}
