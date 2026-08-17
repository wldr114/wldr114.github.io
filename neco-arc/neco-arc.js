/* ==========================================================================
 * Neco-Arc interactive skin (ported from dsh-neco-arc)
 *
 * - 6 draggable Neco-Arc sprites + a draggable mika badge
 * - hover controls: − shrink / + grow / ⚙ settings (badge) / × hide
 * - settings panel: master on/off, speed 0.5×–3×, per-item visibility,
 *   show/hide all, reset
 * - positions / sizes / speed / visibility persist in localStorage
 * ========================================================================== */
(function () {
  'use strict'

  var ASSET = '/neco-arc/'

  /* sprite sheets: w=display width, frames=steps(N), ar=height/width, totalMs=full loop */
  var SPRITES = [
    { key: 'nc-1', src: '1.sheet.png', cls: 'nc-1', w: 92, frames: 10, ar: 1.1319, totalMs: 1000 },
    { key: 'nc-2', src: '2.sheet.png', cls: 'nc-2', w: 78, frames: 2,  ar: 1.4348, totalMs: 200 },
    { key: 'nc-3', src: '3.sheet.png', cls: 'nc-3', w: 68, frames: 8,  ar: 1.6263, totalMs: 240 },
    { key: 'nc-4', src: '4.sheet.png', cls: 'nc-4', w: 62, frames: 7,  ar: 1.6632, totalMs: 770 },
    { key: 'nc-5', src: '5.sheet.png', cls: 'nc-5', w: 84, frames: 22, ar: 1.0526, totalMs: 2200 },
    { key: 'nc-6', src: '6.sheet.png', cls: 'nc-6', w: 72, frames: 4,  ar: 1.4348, totalMs: 400 },
  ]
  var BADGE_W = 64

  var MODE_KEY = 'neco-arc.mode'
  var STATE_KEY = 'neco-arc.state'

  var mode = readMode()
  var state = { speed: 1, items: freshItems() }
  var itemEls = {}
  var overlay = null
  var panel = null

  /* ---- persistence ---- */
  function readMode() {
    try { return localStorage.getItem(MODE_KEY) === 'off' ? 'off' : 'on' } catch (e) { return 'on' }
  }
  function writeMode(m) {
    try { localStorage.setItem(MODE_KEY, m) } catch (e) { /* ignore */ }
  }
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
    wrap.appendChild(face)
    wrap.appendChild(buildCtrl(s.key, false))
    itemEls[s.key] = { wrap: wrap, face: face, sprite: s }
    bindDrag(wrap, face, s.key)
    applyItem(s.key)
    return wrap
  }

  function buildBadge() {
    var wrap = document.createElement('div')
    wrap.className = 'neco-arc-item nc-badge'
    var face = document.createElement('div')
    face.className = 'neco-arc-face neco-arc-badge-face'
    wrap.appendChild(face)
    wrap.appendChild(buildCtrl('badge', true))
    itemEls.badge = { wrap: wrap, face: face, sprite: null }
    bindDrag(wrap, face, 'badge')
    applyItem('badge')
    return wrap
  }

  function buildCtrl(key, withGear) {
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

    if (withGear) {
      var gear = document.createElement('button')
      gear.type = 'button'; gear.textContent = '⚙'; gear.title = '皮肤设置'
      gear.addEventListener('click', function (e) { e.stopPropagation(); togglePanel() })
      bar.appendChild(gear)
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
      return
    }
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
      rec.face.style.animationName = ''
    } else {
      var s = rec.sprite
      var dw = Math.round(s.w * size)
      var dh = Math.round(dw * s.ar)
      var sheetW = s.frames * dw
      rec.face.style.width = dw + 'px'
      rec.face.style.height = dh + 'px'
      rec.face.style.backgroundImage = "url('" + ASSET + s.src + "')"
      rec.face.style.backgroundSize = sheetW + 'px ' + dh + 'px'
      rec.face.style.backgroundPosition = '0px 0px'
      rec.face.style.animationName = 'nc-frames'
      rec.face.style.animationDuration = (s.totalMs / 1000 / state.speed) + 's'
      rec.face.style.animationTimingFunction = 'steps(' + s.frames + ')'
      rec.face.style.animationIterationCount = 'infinite'
      rec.face.style.setProperty('--nc-shift', (-sheetW) + 'px')
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

  function applySpeed() {
    SPRITES.forEach(function (s) {
      var rec = itemEls[s.key]
      if (rec && rec.face.style.animationName === 'nc-frames') {
        rec.face.style.animationDuration = (s.totalMs / 1000 / state.speed) + 's'
      }
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
    applyItem(key); saveState(); syncPanel()
  }
  function setAllVisible(v) {
    Object.keys(state.items).forEach(function (k) { state.items[k].visible = v; applyItem(k) })
    saveState(); syncPanel()
  }
  function setSpeed(v) {
    state.speed = clamp(v, 0.5, 3)
    applySpeed(); saveState(); syncPanel()
  }
  function resetAll() {
    state.speed = 1
    state.items = freshItems()
    Object.keys(itemEls).forEach(applyItem)
    applySpeed(); saveState(); syncPanel()
  }
  function setMode(m) {
    mode = m
    writeMode(m)
    applyMode(); syncPanel()
  }
  function applyMode() {
    if (overlay) overlay.style.display = mode === 'off' ? 'none' : ''
    if (mode === 'off' && panel) panel.classList.remove('open')
  }

  /* ---- settings panel ---- */
  function buildPanel() {
    panel = document.createElement('div')
    panel.id = 'neco-arc-panel'

    var head = document.createElement('div')
    head.className = 'nap-head'
    var title = document.createElement('div')
    title.className = 'nap-title'
    title.textContent = 'Neco-Arc 皮肤'
    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'nap-close'
    close.title = '关闭'
    close.textContent = '×'
    close.addEventListener('click', function () { panel.classList.remove('open') })
    head.appendChild(title)
    head.appendChild(close)

    var hint = document.createElement('div')
    hint.className = 'nap-hint'
    hint.textContent = '动图/角标可拖动；悬停显示 − + × 可缩放/隐藏；设置自动保存'

    /* master on/off + reset */
    var row1 = document.createElement('div')
    row1.className = 'nap-row'
    var btnOn = document.createElement('button')
    btnOn.type = 'button'; btnOn.className = 'nap-btn'; btnOn.textContent = '开启'
    btnOn.addEventListener('click', function () { setMode('on') })
    var btnOff = document.createElement('button')
    btnOff.type = 'button'; btnOff.className = 'nap-btn'; btnOff.textContent = '关闭'
    btnOff.addEventListener('click', function () { setMode('off') })
    var btnReset = document.createElement('button')
    btnReset.type = 'button'; btnReset.className = 'nap-btn'; btnReset.textContent = '复位到默认'
    btnReset.addEventListener('click', resetAll)
    row1.appendChild(btnOn)
    row1.appendChild(btnOff)
    row1.appendChild(btnReset)

    /* speed slider */
    var speedRow = document.createElement('div')
    speedRow.className = 'nap-slider'
    var speedLabel = document.createElement('span')
    speedLabel.textContent = '动图速度 1.0×'
    var speedInput = document.createElement('input')
    speedInput.type = 'range'
    speedInput.min = '0.5'
    speedInput.max = '3'
    speedInput.step = '0.1'
    speedInput.value = String(state.speed)
    speedInput.addEventListener('input', function () {
      setSpeed(parseFloat(speedInput.value))
      speedLabel.textContent = '动图速度 ' + state.speed.toFixed(1) + '×'
    })
    speedRow.appendChild(speedLabel)
    speedRow.appendChild(speedInput)

    /* per-item chips */
    var row2 = document.createElement('div')
    row2.className = 'nap-row'
    SPRITES.forEach(function (s, i) {
      row2.appendChild(chip('动图' + (i + 1), s.key))
    })
    row2.appendChild(chip('角标', 'badge'))

    /* show / hide all */
    var row3 = document.createElement('div')
    row3.className = 'nap-row'
    var showAll = document.createElement('button')
    showAll.type = 'button'; showAll.className = 'nap-chip active'; showAll.textContent = '全部显示'
    showAll.addEventListener('click', function () { setAllVisible(true) })
    var hideAll = document.createElement('button')
    hideAll.type = 'button'; hideAll.className = 'nap-chip active'; hideAll.textContent = '全部隐藏'
    hideAll.addEventListener('click', function () { setAllVisible(false) })
    row3.appendChild(showAll)
    row3.appendChild(hideAll)

    panel.appendChild(head)
    panel.appendChild(hint)
    panel.appendChild(row1)
    panel.appendChild(speedRow)
    panel.appendChild(row2)
    panel.appendChild(row3)
    document.body.appendChild(panel)

    /* keep references for syncing */
    panel._btnOn = btnOn
    panel._btnOff = btnOff
    panel._speedLabel = speedLabel
    panel._speedInput = speedInput
    panel._showAll = showAll
    panel._hideAll = hideAll
    panel._chips = {}
    var chipEls = row2.querySelectorAll('.nap-chip')
    SPRITES.forEach(function (s, i) { panel._chips[s.key] = chipEls[i] })
    panel._chips.badge = chipEls[SPRITES.length]

    syncPanel()
  }

  function chip(label, key) {
    var b = document.createElement('button')
    b.type = 'button'
    b.className = 'nap-chip active'
    b.textContent = label
    b.addEventListener('click', function () { toggleItem(key) })
    return b
  }

  function togglePanel() {
    if (!panel) return
    panel.classList.toggle('open')
  }

  function syncPanel() {
    if (!panel) return
    var on = mode !== 'off'
    panel._btnOn.classList.toggle('active', on)
    panel._btnOff.classList.toggle('active', !on)
    panel._speedInput.value = String(state.speed)
    panel._speedLabel.textContent = '动图速度 ' + state.speed.toFixed(1) + '×'
    Object.keys(panel._chips).forEach(function (k) {
      panel._chips[k].classList.toggle('active', state.items[k] && state.items[k].visible !== false)
    })
  }

  /* ---- init ---- */
  function init() {
    loadState()
    buildOverlay()
    buildPanel()
    applyMode()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
