import React from 'react'
import { Select } from 'worker-forge'

const frame: React.CSSProperties = {
  background: 'var(--bg-1)', color: 'var(--tx)', padding: '28px 30px',
  display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap',
  borderRadius: '10px', minHeight: '72px',
}
const field: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '7px',
  fontFamily: 'var(--mono)', fontSize: '10.5px', color: 'var(--tx-lo)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

// The custom dropdown control (closed state — it opens a popover on click).
// A no-op onChange keeps these static preview cells inert.
const noop = () => {}

// Default control with a selected value, plus the mono variant used for
// code-like values (branches, versions).
export function Default() {
  return (
    <div style={frame}>
      <label style={field}>
        Trigger
        <Select value="cron" onChange={noop} options={[
          { value: 'manual', label: 'Manual' },
          { value: 'cron', label: 'On a schedule' },
          { value: 'webhook', label: 'Webhook' },
        ]} />
      </label>
      <label style={field}>
        Branch
        <Select value="main" mono onChange={noop} options={[
          { value: 'main', label: 'main' },
          { value: 'develop', label: 'develop' },
          { value: 'release/1.4', label: 'release/1.4' },
        ]} />
      </label>
    </div>
  )
}

// `block` stretches the control to fill its container — used in forms.
export function Block() {
  return (
    <div style={{ ...frame, display: 'block', maxWidth: 340 }}>
      <label style={{ ...field, display: 'flex' }}>
        Runner image
        <div style={{ marginTop: 7 }}>
          <Select value="node20" block onChange={noop} options={[
            { value: 'node20', label: 'node:20-bookworm' },
            { value: 'python312', label: 'python:3.12-slim' },
            { value: 'ubuntu', label: 'ubuntu:24.04' },
          ]} />
        </div>
      </label>
    </div>
  )
}

// `search` adds a filter row to the popover for long option lists (e.g. time
// zones). Shown closed; the search box appears once opened.
export function Searchable() {
  return (
    <div style={frame}>
      <label style={field}>
        Time zone
        <Select value="America/New_York" mono search minWidth={200} onChange={noop} options={[
          { value: 'America/New_York', label: 'America/New_York' },
          { value: 'Europe/London', label: 'Europe/London' },
          { value: 'Asia/Kolkata', label: 'Asia/Kolkata' },
          { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
        ]} />
      </label>
    </div>
  )
}
