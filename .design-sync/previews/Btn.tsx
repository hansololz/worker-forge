import React from 'react'
import { Btn } from 'worker-forge'

const frame: React.CSSProperties = {
  background: 'var(--bg-1)', color: 'var(--tx)', padding: '28px 30px',
  display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
  borderRadius: '10px', minHeight: '72px',
}

// The four visual variants: primary (warm-orange fill), default (neutral),
// ghost (borderless), danger (red) — the app's action vocabulary.
export function Variants() {
  return (
    <div style={frame}>
      <Btn variant="primary" icon="play">Run workflow</Btn>
      <Btn icon="sync">Retry</Btn>
      <Btn variant="ghost">Cancel</Btn>
      <Btn variant="danger" icon="trash">Delete</Btn>
    </div>
  )
}

// Two sizes: the 32px default and the compact `sm` used in dense toolbars.
export function Sizes() {
  return (
    <div style={frame}>
      <Btn variant="primary" icon="plus">New task</Btn>
      <Btn variant="primary" size="sm" icon="plus">New task</Btn>
      <Btn size="sm" icon="edit">Edit</Btn>
      <Btn size="sm" variant="ghost">Duplicate</Btn>
    </div>
  )
}

// Leading (`icon`) and trailing (`iconR`) glyphs, plus a disabled state.
export function WithIcons() {
  return (
    <div style={frame}>
      <Btn variant="primary" icon="rocket">Deploy</Btn>
      <Btn icon="link" iconR="chevR">Add trigger</Btn>
      <Btn variant="ghost" iconR="chevD">More</Btn>
      <Btn disabled icon="play">Running…</Btn>
    </div>
  )
}

// Icon-only buttons (no children → square `icon` shape) for toolbars.
export function IconOnly() {
  return (
    <div style={frame}>
      <Btn variant="primary" icon="play" />
      <Btn icon="edit" />
      <Btn icon="copy" />
      <Btn variant="ghost" icon="dots" />
      <Btn variant="danger" icon="trash" />
    </div>
  )
}
