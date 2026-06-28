// Unit: ConfirmModal — renders content, fires callbacks. Component renders into
// document.body via a portal; Testing Library queries the whole document.
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmModal } from '../../src/ui.jsx'

describe('ConfirmModal', () => {
  it('shows the title, message and labels', () => {
    render(
      <ConfirmModal
        title="Delete workflow?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Delete workflow?')).toBeTruthy()
    expect(screen.getByText('This cannot be undone.')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
  })

  it('invokes onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmModal title="t" message="m" confirmLabel="Yes" onConfirm={onConfirm} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Yes'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('invokes onClose on Escape', () => {
    const onClose = vi.fn()
    render(<ConfirmModal title="t" message="m" onConfirm={() => {}} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
