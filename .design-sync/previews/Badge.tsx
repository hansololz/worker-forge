import React from 'react'
import { Badge } from 'worker-forge'

const frame: React.CSSProperties = {
  background: 'var(--bg-1)', color: 'var(--tx)', padding: '28px 30px',
  display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
  borderRadius: '10px', minHeight: '72px',
}

// The run-status vocabulary, each with its status-colored dot. `running`
// pulses to signal live work.
export function Statuses() {
  return (
    <div style={frame}>
      <Badge status="running" pulse />
      <Badge status="succeeded" />
      <Badge status="failed" />
      <Badge status="queued" />
      <Badge status="cancelled" />
      <Badge status="interrupted" />
      <Badge status="skipped" />
    </div>
  )
}

// Custom label text overrides the default status label.
export function CustomLabels() {
  return (
    <div style={frame}>
      <Badge status="running" pulse>deploying</Badge>
      <Badge status="succeeded">3 passed</Badge>
      <Badge status="failed">2 failed</Badge>
      <Badge status="queued">waiting</Badge>
    </div>
  )
}

// `noDot` drops the leading dot for tighter, text-only tags.
export function WithoutDot() {
  return (
    <div style={frame}>
      <Badge status="succeeded" noDot>main</Badge>
      <Badge status="running" noDot>v1.4.0</Badge>
      <Badge status="skipped" noDot>cron</Badge>
    </div>
  )
}
