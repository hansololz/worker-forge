/* ============================================================
   overlay-scroll.js
   A tiny custom scrollbar that floats over content (no layout
   displacement) and fades in while scrolling, out when idle.

   Native scrollbars are hidden in CSS; this draws a thumb for the
   prominent scroll regions and re-attaches as React re-renders.
   ============================================================ */

// Scroll regions that get an overlay thumb.
const SELECTOR = '.content, .term-body, .dd-panel, .add-task-menu, .code-input'
const IDLE_MS = 900       // fade out this long after the last scroll
const MIN_THUMB = 28      // px

class Overlay {
  constructor(el) {
    this.el = el
    this.thumb = document.createElement('div')
    this.thumb.className = 'oscroll-thumb'
    document.body.appendChild(this.thumb)

    this.visible = false
    this.dragging = false
    this.hideTimer = null
    this.dragStartY = 0
    this.dragStartScroll = 0

    this._onScroll = this.onScroll.bind(this)
    this._onEnter = this.flash.bind(this)
    this._reposition = this.reposition.bind(this)
    this._onThumbDown = this.onThumbDown.bind(this)

    el.addEventListener('scroll', this._onScroll, { passive: true })
    el.addEventListener('mouseenter', this._onEnter)
    this.thumb.addEventListener('pointerdown', this._onThumbDown)

    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(this._reposition)
      this.ro.observe(el)
    }

    this.reposition()
  }

  scrollable() {
    return this.el.scrollHeight - this.el.clientHeight > 2
  }

  reposition() {
    const el = this.el
    if (!el.isConnected) { this.destroy(); return }
    if (!this.scrollable()) { this.thumb.style.display = 'none'; return }
    this.thumb.style.display = 'block'

    const rect = el.getBoundingClientRect()
    const track = rect.height
    const th = Math.max(MIN_THUMB, track * (el.clientHeight / el.scrollHeight))
    const maxScroll = el.scrollHeight - el.clientHeight
    const maxTop = track - th
    const top = rect.top + (maxScroll > 0 ? (el.scrollTop / maxScroll) * maxTop : 0)

    this.thumb.style.height = th + 'px'
    this.thumb.style.top = top + 'px'
    this.thumb.style.left = (rect.right - this.thumb.offsetWidth - 2) + 'px'
  }

  show() {
    if (!this.scrollable()) return
    this.reposition()
    if (!this.visible) { this.thumb.classList.add('show'); this.visible = true }
  }

  scheduleHide() {
    clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => {
      if (this.dragging) return
      this.thumb.classList.remove('show')
      this.visible = false
    }, IDLE_MS)
  }

  onScroll() { this.show(); this.scheduleHide() }
  flash() { this.show(); this.scheduleHide() }

  onThumbDown(e) {
    e.preventDefault()
    this.dragging = true
    this.thumb.classList.add('drag')
    this.dragStartY = e.clientY
    this.dragStartScroll = this.el.scrollTop
    clearTimeout(this.hideTimer)

    const move = (ev) => {
      const rect = this.el.getBoundingClientRect()
      const th = this.thumb.offsetHeight
      const maxTop = rect.height - th
      const maxScroll = this.el.scrollHeight - this.el.clientHeight
      const dy = ev.clientY - this.dragStartY
      const deltaScroll = maxTop > 0 ? (dy / maxTop) * maxScroll : 0
      this.el.scrollTop = this.dragStartScroll + deltaScroll
    }
    const up = () => {
      this.dragging = false
      this.thumb.classList.remove('drag')
      this.scheduleHide()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  destroy() {
    clearTimeout(this.hideTimer)
    this.el.removeEventListener('scroll', this._onScroll)
    this.el.removeEventListener('mouseenter', this._onEnter)
    if (this.ro) this.ro.disconnect()
    if (this.thumb.parentNode) this.thumb.parentNode.removeChild(this.thumb)
    this.el.__oscroll = null
  }
}

function scan() {
  const els = document.querySelectorAll(SELECTOR)
  for (const el of els) {
    if (!el.__oscroll) el.__oscroll = new Overlay(el)
  }
}

// Reposition every visible thumb on window scroll/resize.
function repositionAll() {
  const els = document.querySelectorAll(SELECTOR)
  for (const el of els) {
    if (el.__oscroll) el.__oscroll.reposition()
  }
}

let started = false
export function initOverlayScroll() {
  if (started) return
  started = true
  scan()
  const mo = new MutationObserver(() => scan())
  mo.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', repositionAll, { passive: true })
  window.addEventListener('scroll', repositionAll, { passive: true, capture: true })
}
