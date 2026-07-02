import React from 'react'
import { Dot } from 'worker-forge'

const frame: React.CSSProperties = {
  background: 'var(--bg-1)', color: 'var(--tx-mid)', padding: '28px 30px',
  display: 'flex', gap: '22px', alignItems: 'center', flexWrap: 'wrap',
  borderRadius: '10px', minHeight: '72px', fontFamily: 'var(--mono)', fontSize: '12px',
}
const item: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '8px' }

// The bare status dot — the smallest status marker, used in tables and rails
// where a full Badge is too heavy. One per status color.
export function Statuses() {
  return (
    <div style={frame}>
      <span style={item}><Dot status="running" /> running</span>
      <span style={item}><Dot status="succeeded" /> succeeded</span>
      <span style={item}><Dot status="failed" /> failed</span>
      <span style={item}><Dot status="queued" /> queued</span>
      <span style={item}><Dot status="cancelled" /> cancelled</span>
      <span style={item}><Dot status="interrupted" /> interrupted</span>
    </div>
  )
}

// `pulse` animates the dot for in-flight work.
export function Pulsing() {
  return (
    <div style={frame}>
      <span style={item}><Dot status="running" pulse /> live run</span>
      <span style={item}><Dot status="queued" pulse /> starting…</span>
    </div>
  )
}
