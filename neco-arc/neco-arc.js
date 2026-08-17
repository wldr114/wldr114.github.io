/* ==========================================================================
 * Neco-Arc interactive skin (JS-driven frame playback, no CSS keyframes)
 *
 * - 6 draggable Neco-Arc sprites + a draggable mika badge
 * - hover controls: − shrink · + grow · speed (sprites) · × hide
 * - frame playback is driven by requestAnimationFrame, so speed is fully
 *   adjustable and rendering does not depend on CSS animation support
 * ========================================================================== */
(function () {
  'use strict'

  var ASSET = '/neco-arc/'

  /* sprite sheets: w=display width, frames=count, ar=height/width, totalMs=full loop */
  var SPRITES = [
    { key: 'nc-1', src: '1.sheet.png', cls: 'nc-1', w: 92, frames: 10, ar: 1.1319, totalMs: 1000 },
    { key: 'nc-2', src: '2.sheet.png', cls: 'nc-2', w: 78, frames: 2,  ar: 1.4348, totalMs: 200 },
    { key: 'nc-3', src: '3.sheet.png', cls: 'nc-3', w: 68, frames: 8,  ar: 1.6263, totalMs: 240 },
    { key: 'nc-4', src: '4.sheet.png', cls: 'nc-4', w: 62, frames: 7,  ar: 1.6632, totalMs: 770 },
    { key: 'nc-5', src: '5.sheet.png', cls: 'nc-5', w: 84, frames: 22, ar: 1.0526, totalMs: 2200 },
    { key: 'nc-6', src: '6.sheet.png', cls: 'nc-6', w: 72, frames: 4,  ar: 1.4348, totalMs: 400 },
  ]
  var BADGE_W = 64
  var SPEEDS = [0.5, 1, 1.5, 2, 3]

  var STATE_KEY = 'neco-arc.state.v3'

  var state = { speed: 1, items: freshItems() }
  var itemEls = {}
  var overlay = null
  var rafId = null

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)) }

  function freshItems() {
    var o = {}
    SPRITES.forEach(function (s) { o[s.key] = { x: null, y: null, visible: true, size: 1 } })
    o.badge = { x: null, y: null, visible: true, size: 1 }
    return o
  }

  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ speed: state.speed, items: state.items })) } catch (e) { /* ignore */ }
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STATE_KEY)
      if (!raw) return
      var saved = JSON.parse(raw)
      if (saved && typeof saved === 'object') {
        if (typeof saved.speed === 'number') state.speed = clamp(saved.speed, 0.5, 3)
        if (saved.items && typeof saved.items === 'object') {
          Object.keys(state.items).forEach(function (k) {
            var it = saved.items[k]
            if (it && typeof it === 'object') {
              state.items[k] = {
                x: typeof it.x === 'number' ? it.x : null,
                y: typeof it.y === 'number' ? it.y : null,
                visible: it.visible !== false,
                size: typeof it.size === 'number' ? clamp(it.size, 0.3, 3) : 1,
              }
            }
          })
        }
      }
    } catch (e) { /* ignore */ }
  }

  /* ---- build overlay ---- */
  function buildOverlay() {
    overlay = document.createElement('div')
    overlay.id = 'neco-arc-overlay'
    overlay.setAttribute('aria-hidden', 'true')
    document.body.appendChild(overlay)

    SPRITES.forEach(function (s) { overlay.appendChild(buildItem(s)) })
    overlay.appendChild(buildBadge())
  }

  function buildItem(s) {
    var wrap = document.createElement('div')
    wrap.className = 'neco-arc-item ' + s.cls
    var face = document.createElement('div')
    face.className = 'neco-arc-face'
    itemEls[s.key] = { wrap: wrap, face: face, sprite: s, hidden: false, frameIndex: 0, lastTime: 0, dw: 0 }
    wrap.appendChild(face)
    wrap.appendChild(buildCtrl(s.key, true))
    bindDrag(wrap, face, s.key)
    applyItem(s.key)
    return wrap
  }

  function buildBadge() {
    var wrap = document.createElement('div')
    wrap.className = 'neco-arc-item nc-badge'
    var face = document.createElement('div')
    face.className = 'neco-arc-face neco-arc-badge-face'
    itemEls.badge = { wrap: wrap, face: face, sprite: null, hidden: false }
    wrap.appendChild(face)
    wrap.appendChild(buildCtrl('badge', false))
    bindDrag(wrap, face, 'badge')
    applyItem('badge')
    return wrap
  }

  function buildCtrl(key, withSpeed) {
    var bar = document.createElement('div')
    bar.className = 'neco-arc-ctrl'

    var dec = document.createElement('button')
    dec.type = 'button'; dec.textContent = '−'; dec.title = '缩小'
    dec.addEventListener('click', function (e) { e.stopPropagation(); decSize(key) })

    var inc = document.createElement('button')
    inc.type = 'button'; inc.textContent = '+'; inc.title = '放大'
    inc.addEventListener('click', function (e) { e.stopPropagation(); incSize(key) })

    bar.appendChild(dec)
    bar.appendChild(inc)

    if (withSpeed) {
      var spd = document.createElement('button')
      spd.type = 'button'
      spd.className = 'neco-arc-speed'
      spd.textContent = state.speed + '×'
      spd.title = '动图速度（点击切换）'
      spd.addEventListener('click', function (e) { e.stopPropagation(); cycleSpeed() })
      bar.appendChild(spd)
      itemEls[key].speedBtn = spd
    }

    var hide = document.createElement('button')
    hide.type = 'button'; hide.textContent = '×'; hide.title = '隐藏'
    hide.addEventListener('click', function (e) { e.stopPropagation(); toggleItem(key) })
    bar.appendChild(hide)

    return bar
  }

  /* ---- apply state to DOM ---- */
  function applyItem(key) {
    var rec = itemEls[key]
    if (!rec) return
    var it = state.items[key]
    if (!it || it.visible === false) {
      rec.wrap.style.display = 'none'
      rec.hidden = true
      return
    }
    rec.hidden = false
    rec.wrap.style.display = ''
    var size = it.size || 1

    if (key === 'badge') {
      var w = Math.round(BADGE_W * size)
      rec.wrap.style.width = w + 'px'
      rec.wrap.style.height = w + 'px'
      rec.face.style.width = w + 'px'
      rec.face.style.height = w + 'px'
      rec.face.style.backgroundImage = "url('" + ASSET + 'mika.jpg' + "')"
      rec.face.style.backgroundSize = 'cover'
      rec.face.style.backgroundPosition = 'center'
    } else {
      var s = rec.sprite
      var dw = Math.round(s.w * size)
      var dh = Math.round(dw * s.ar)
      var sheetW = s.frames * dw
      rec.dw = dw
      rec.frameIndex = 0
      rec.lastTime = 0
      rec.face.style.width = dw + 'px'
      rec.face.style.height = dh + 'px'
      rec.face.style.backgroundImage = "url('" + ASSET + s.src + "')"
      rec.face.style.backgroundSize = sheetW + 'px ' + dh + 'px'
      rec.face.style.backgroundPosition = '0px 0px'
    }

    if (it.x != null) {
      rec.wrap.style.left = it.x + 'px'
      rec.wrap.style.top = it.y + 'px'
      rec.wrap.style.right = 'auto'
      rec.wrap.style.bottom = 'auto'
    } else {
      rec.wrap.style.left = ''
      rec.wrap.style.top = ''
      rec.wrap.style.right = ''
      rec.wrap.style.bottom = ''
    }
  }

  /* ---- frame playback (single rAF loop drives all sprites) ---- */
  function tick(now) {
    SPRITES.forEach(function (s) {
      var rec = itemEls[s.key]
      if (!rec || rec.hidden) return
      var frameMs = s.totalMs / s.frames / state.speed
      if (!rec.lastTime) rec.lastTime = now
      if (now - rec.lastTime >= frameMs) {
        rec.frameIndex = (rec.frameIndex + 1) % s.frames
        rec.face.style.backgroundPosition = (-rec.frameIndex * rec.dw) + 'px 0px'
        rec.lastTime = now
      }
    })
    rafId = requestAnimationFrame(tick)
  }

  function syncSpeedButtons() {
    SPRITES.forEach(function (s) {
      var rec = itemEls[s.key]
      if (rec && rec.speedBtn) rec.speedBtn.textContent = state.speed + '×'
    })
  }

  /* ---- drag ---- */
  var drag = null
  function bindDrag(wrap, face, key) {
    face.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return
      e.preventDefault()
      try { face.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      var rect = wrap.getBoundingClientRect()
      drag = { key: key, startX: e.clientX, startY: e.clientY, baseLeft: rect.left, baseTop: rect.top }
      face.classList.add('nc-dragging')
      wrap.classList.add('nc-dragging')
    })
    face.addEventListener('pointermove', function (e) {
      if (!drag || drag.key !== key) return
      state.items[key].x = Math.round(drag.baseLeft + (e.clientX - drag.startX))
      state.items[key].y = Math.round(drag.baseTop + (e.clientY - drag.startY))
      applyItem(key)
    })
    function end() {
      if (!drag || drag.key !== key) return
      face.classList.remove('nc-dragging')
      wrap.classList.remove('nc-dragging')
      drag = null
      saveState()
    }
    face.addEventListener('pointerup', end)
    face.addEventListener('pointercancel', end)
  }

  /* ---- actions ---- */
  function incSize(key) {
    var it = state.items[key]
    it.size = clamp((it.size || 1) * 1.2, 0.3, 3)
    applyItem(key); saveState()
  }
  function decSize(key) {
    var it = state.items[key]
    it.size = clamp((it.size || 1) * 0.85, 0.3, 3)
    applyItem(key); saveState()
  }
  function toggleItem(key) {
    state.items[key].visible = !state.items[key].visible
    applyItem(key); saveState()
  }
  function cycleSpeed() {
    var idx = SPEEDS.indexOf(state.speed)
    if (idx === -1) idx = SPEEDS.indexOf(1)
    state.speed = SPEEDS[(idx + 1) % SPEEDS.length]
    syncSpeedButtons()
    saveState()
  }

  /* ---- init ---- */
  function init() {
    loadState()
    buildOverlay()
    syncSpeedButtons()
    rafId = requestAnimationFrame(tick)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
