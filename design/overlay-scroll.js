/* ============================================================
   overlay-scroll.js
   A tiny custom scrollbar that floats over content (no layout
   displacement) and fades in while scrolling, out when idle.

   Native scrollbars are hidden in CSS; this draws a thumb for the
   prominent scroll regions and re-attaches as React re-renders.
   ============================================================ */
(function () {
  "use strict";

  // Scroll regions that get an overlay thumb.
  var SELECTOR = ".content, .term-body, .dd-panel, .add-task-menu, .code-input";
  var IDLE_MS = 900;       // fade out this long after the last scroll
  var MIN_THUMB = 28;      // px

  function Overlay(el) {
    this.el = el;
    this.thumb = document.createElement("div");
    this.thumb.className = "oscroll-thumb";
    document.body.appendChild(this.thumb);

    this.visible = false;
    this.dragging = false;
    this.hideTimer = null;
    this.dragStartY = 0;
    this.dragStartScroll = 0;

    this._onScroll = this.onScroll.bind(this);
    this._onEnter = this.flash.bind(this);
    this._reposition = this.reposition.bind(this);
    this._onThumbDown = this.onThumbDown.bind(this);

    el.addEventListener("scroll", this._onScroll, { passive: true });
    el.addEventListener("mouseenter", this._onEnter);
    this.thumb.addEventListener("pointerdown", this._onThumbDown);

    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(this._reposition);
      this.ro.observe(el);
    }

    this.reposition();
  }

  Overlay.prototype.scrollable = function () {
    return this.el.scrollHeight - this.el.clientHeight > 2;
  };

  Overlay.prototype.reposition = function () {
    var el = this.el;
    if (!el.isConnected) { this.destroy(); return; }
    if (!this.scrollable()) { this.thumb.style.display = "none"; return; }
    this.thumb.style.display = "block";

    var rect = el.getBoundingClientRect();
    var track = rect.height;
    var th = Math.max(MIN_THUMB, track * (el.clientHeight / el.scrollHeight));
    var maxScroll = el.scrollHeight - el.clientHeight;
    var maxTop = track - th;
    var top = rect.top + (maxScroll > 0 ? (el.scrollTop / maxScroll) * maxTop : 0);

    this.thumb.style.height = th + "px";
    this.thumb.style.top = top + "px";
    this.thumb.style.left = (rect.right - this.thumb.offsetWidth - 2) + "px";
  };

  Overlay.prototype.show = function () {
    if (!this.scrollable()) return;
    this.reposition();
    if (!this.visible) { this.thumb.classList.add("show"); this.visible = true; }
  };

  Overlay.prototype.scheduleHide = function () {
    var self = this;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(function () {
      if (self.dragging) return;
      self.thumb.classList.remove("show");
      self.visible = false;
    }, IDLE_MS);
  };

  Overlay.prototype.onScroll = function () { this.show(); this.scheduleHide(); };
  Overlay.prototype.flash = function () { this.show(); this.scheduleHide(); };

  Overlay.prototype.onThumbDown = function (e) {
    e.preventDefault();
    this.dragging = true;
    this.thumb.classList.add("drag");
    this.dragStartY = e.clientY;
    this.dragStartScroll = this.el.scrollTop;
    clearTimeout(this.hideTimer);

    var self = this;
    function move(ev) {
      var rect = self.el.getBoundingClientRect();
      var th = self.thumb.offsetHeight;
      var maxTop = rect.height - th;
      var maxScroll = self.el.scrollHeight - self.el.clientHeight;
      var dy = ev.clientY - self.dragStartY;
      var deltaScroll = maxTop > 0 ? (dy / maxTop) * maxScroll : 0;
      self.el.scrollTop = self.dragStartScroll + deltaScroll;
    }
    function up() {
      self.dragging = false;
      self.thumb.classList.remove("drag");
      self.scheduleHide();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  Overlay.prototype.destroy = function () {
    clearTimeout(this.hideTimer);
    this.el.removeEventListener("scroll", this._onScroll);
    this.el.removeEventListener("mouseenter", this._onEnter);
    if (this.ro) this.ro.disconnect();
    if (this.thumb.parentNode) this.thumb.parentNode.removeChild(this.thumb);
    this.el.__oscroll = null;
  };

  function scan() {
    var els = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.__oscroll) el.__oscroll = new Overlay(el);
    }
  }

  // Reposition every visible thumb on window scroll/resize.
  function repositionAll() {
    // thumbs hold no back-ref; just rescan owners
    var els = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < els.length; i++) {
      if (els[i].__oscroll) els[i].__oscroll.reposition();
    }
  }

  function init() {
    scan();
    var mo = new MutationObserver(function () { scan(); });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", repositionAll, { passive: true });
    window.addEventListener("scroll", repositionAll, { passive: true, capture: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
