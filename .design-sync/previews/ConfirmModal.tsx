import React from 'react'
import { ConfirmModal } from 'worker-forge'

const noop = () => {}

// The shared destructive-action prompt (renders as a centered overlay over a
// scrim, via a portal). `tone="danger"` (default) — red icon + red confirm.
export function Danger() {
  return (
    <ConfirmModal
      icon="trash"
      title="Delete workflow?"
      message={<>This permanently removes <b>nightly-build</b> and its run history. This can’t be undone.</>}
      confirmLabel="Delete workflow"
      cancelLabel="Cancel"
      onConfirm={noop}
      onClose={noop}
    />
  )
}

// `tone="warn"` (amber) for disruptive-but-reversible actions like cancelling
// an in-flight run.
export function Warn() {
  return (
    <ConfirmModal
      icon="alert"
      tone="warn"
      title="Cancel this run?"
      message={<>Run <b>#248</b> is still executing. Cancelling stops all remaining stages.</>}
      confirmLabel="Cancel run"
      cancelLabel="Keep running"
      onConfirm={noop}
      onClose={noop}
    />
  )
}
