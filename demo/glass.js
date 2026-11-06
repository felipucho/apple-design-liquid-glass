/**
 * Liquid Glass for the web. No dependencies, everything driven by springs frame by frame.
 *
 * - enableGlassButtons(selector): buttons inflate on press, light up under the finger,
 *   stretch toward the finger while held (anchored, axis-aligned) and wobble home on release.
 * - createGlassLens(fieldset, onChange): a segmented control whose selection is a piece of glass
 *   you can pick up and slide; what is under it is bent like a real lens.
 * - enableFieldMessages(root): inline validation messages instead of the browser bubble.
 *
 * The reasons behind every number are in skills/apple-design-liquid-glass/LIQUID-GLASS.md.
 */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

/**
 * Approaches `limit` without reaching it, and gradually (90% only at ≈8× the limit, ~140px for 17px):
 * if it saturated early, moving the finger back would not shrink anything until very close.
 */
const rubberBand = (d, limit) => limit * (1 - Math.exp(-d / (limit * 3.5)))

/** Soft cap: grows evenly and eases off, with no point where it sticks (a hard clamp also breaks the way back). */
const softCap = (v, max) => max * Math.tanh(v / max)

/** One damped-spring step with unit mass (semi-implicit Euler: stable with a small dt). */
function step(spring, pos, vel, target, dt) {
  const v = vel + (spring.stiffness * (target - pos) - spring.damping * vel) * dt
  return [pos + v * dt, v]
}

/** Held: tracks the finger closely, no bounce. Released: comes home with one wobble. */
const HELD = { stiffness: 700, damping: 46 }
const RELEASED = { stiffness: 420, damping: 15 }
const INFLATE = { stiffness: 520, damping: 30 }
const DEFLATE = { stiffness: 420, damping: 22 }
/** The lens settling on an option, with a little give. */
const SLIDE = { stiffness: 150, damping: 23 }

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/**
 * rAF loop with fixed 1/120 s substeps. `advance(dt)` integrates, `render()` draws and returns
 * whether to keep going. dt is capped so a dropped frame or a background tab can't fling anything.
 */
function createLoop(advance, render) {
  let frame = 0
  let last = 0
  function tick(now) {
    let dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    while (dt > 0) {
      const d = Math.min(dt, 1 / 120)
      advance(d)
      dt -= d
    }
    frame = render() ? requestAnimationFrame(tick) : 0
  }
  return {
    start() {
      if (frame) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    },
    stop() {
      cancelAnimationFrame(frame)
      frame = 0
    },
  }
}

/** Light under the pointer, in the element's unscaled coordinates. */
function setLight(el, e) {
  const r = el.getBoundingClientRect()
  el.style.setProperty('--x', `${((e.clientX - r.left) * el.offsetWidth) / (r.width || 1)}px`)
  el.style.setProperty('--y', `${((e.clientY - r.top) * el.offsetHeight) / (r.height || 1)}px`)
}

/* ------------------------------------------------------------------ */
/* Glass buttons                                                       */
/* ------------------------------------------------------------------ */

/** Max px the center travels, however far the finger goes. */
const PULL_MAX = 17
/** Share of the pull that moves the whole body; the rest becomes stretch. */
const FOLLOW = 0.1
/** Px of growth per px of pull on each axis, capped relative to size; and how much one axis thins the other. */
const STRETCH = 0.9
const STRETCH_MAX = 0.21
const THIN = 0.45
/** Press growth on the long side, never more than this ratio on small controls. */
const INFLATE_PX = 10
const INFLATE_MAX = 0.08

export function enableGlassButtons(selector = '.glass-button', lightSurfaces = '.glass-card') {
  const states = new Map()
  let active = null

  function draw(s) {
    // The capsule never skews: it grows in width and height by the pull on each axis,
    // so a diagonal pull grows both at once and shifts diagonally toward the finger.
    const growX = softCap(Math.abs(s.pos.x) * STRETCH, s.w * STRETCH_MAX)
    const growY = softCap(Math.abs(s.pos.y) * STRETCH, s.h * STRETCH_MAX)
    const rx = growX / s.w
    const ry = growY / s.h
    const inflate = 1 + s.press * Math.min(INFLATE_MAX, INFLATE_PX / Math.max(s.w, s.h))
    // Growing on one axis thins the other a little, like a droplet.
    const sx = inflate * (1 + rx) * (1 - ry * THIN * 0.5)
    const sy = inflate * (1 + ry) * (1 - rx * THIN * 0.5)
    // Shift by half the growth: only the side facing the finger grows, the opposite edge stays put.
    const tx = s.pos.x * FOLLOW + (Math.sign(s.pos.x) * growX * inflate) / 2
    const ty = s.pos.y * FOLLOW + (Math.sign(s.pos.y) * growY * inflate) / 2
    s.el.style.translate = `${tx.toFixed(2)}px ${ty.toFixed(2)}px`
    s.el.style.scale = `${sx.toFixed(4)} ${sy.toFixed(4)}`
    s.el.style.setProperty('--press', clamp(s.press, 0, 1).toFixed(3))
  }

  const atRest = (s) =>
    s.start === null &&
    Math.hypot(s.pos.x, s.pos.y) < 0.05 &&
    Math.hypot(s.vel.x, s.vel.y) < 0.05 &&
    Math.abs(s.press) < 0.002 &&
    Math.abs(s.pressVel) < 0.02

  const loop = createLoop(
    (dt) => {
      for (const s of states.values()) {
        const held = s.start !== null
        const spring = held ? HELD : RELEASED
        ;[s.pos.x, s.vel.x] = step(spring, s.pos.x, s.vel.x, s.target.x, dt)
        ;[s.pos.y, s.vel.y] = step(spring, s.pos.y, s.vel.y, s.target.y, dt)
        ;[s.press, s.pressVel] = step(held ? INFLATE : DEFLATE, s.press, s.pressVel, held ? 1 : 0, dt)
      }
    },
    () => {
      for (const s of states.values()) {
        if (atRest(s)) {
          s.el.style.removeProperty('translate')
          s.el.style.removeProperty('scale')
          s.el.style.removeProperty('--press')
          delete s.el.dataset.stretching
          states.delete(s.el)
        } else {
          draw(s)
        }
      }
      return states.size > 0
    },
  )

  function release(e) {
    if (!active || ('pointerId' in e && e.pointerId !== active.pointer)) return
    const { state } = active
    active = null
    state.start = null
    state.target = { x: 0, y: 0 }
    delete state.el.dataset.pressed
  }

  document.addEventListener('pointerdown', (e) => {
    if (active || e.button !== 0 || reducedMotion.matches) return
    const el = e.target.closest?.(selector)
    if (!el || el.disabled) return
    // Still wobbling from last time: continue from where it is.
    const state = states.get(el) ?? {
      el,
      w: 1,
      h: 1,
      start: null,
      target: { x: 0, y: 0 },
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      press: 0,
      pressVel: 0,
    }
    state.w = el.offsetWidth || 1
    state.h = el.offsetHeight || 1
    state.start = { x: e.clientX, y: e.clientY }
    state.target = { x: 0, y: 0 }
    states.set(el, state)
    active = { state, pointer: e.pointerId }
    el.dataset.pressed = ''
    el.dataset.stretching = ''
    setLight(el, e)
    loop.start()
  })

  document.addEventListener('pointermove', (e) => {
    const surface = e.target.closest?.(lightSurfaces)
    if (surface) setLight(surface, e)
    const button = e.target.closest?.(selector)
    if (button) setLight(button, e)

    if (!active || e.pointerId !== active.pointer) return
    const { state } = active
    if (!state.start) return
    const dx = e.clientX - state.start.x
    const dy = e.clientY - state.start.y
    const distance = Math.hypot(dx, dy)
    const pull = rubberBand(distance, PULL_MAX)
    state.target = distance ? { x: (dx / distance) * pull, y: (dy / distance) * pull } : { x: 0, y: 0 }
    if (button !== state.el) setLight(state.el, e)
  })

  document.addEventListener('pointerup', release)
  document.addEventListener('pointercancel', release)
  window.addEventListener('blur', release)
}

/* ------------------------------------------------------------------ */
/* Glass lens segmented control                                        */
/* ------------------------------------------------------------------ */

/** How much the lens lifts while traveling on its own (tap on another option), relative to full pick-up. */
const LIFT = 0.75
/** Finger movement that turns a press on another option from a tap into a drag. */
const DRAG_THRESHOLD = 6

/**
 * Lens refraction, like a real piece of glass lying on the content: it shows only what is under it, each thing once.
 * Along each ray from the center (u = 0 center, u = 1 rim), point u shows what is at lens(u) = u·(A + (1 − A)·|u|^B):
 * - the center is magnified 1/A;
 * - the rim is compressed (it looks stretched outward);
 * - lens(±1) = ±1 and |lens(u)| ≤ |u|: it never brings in something from outside (that would duplicate it)
 *   and never leaves something underneath unshown.
 * Strength f (0 at rest, 1 when picked up) blends it with the identity.
 */
const A = 0.82
const B = 4
const lens = (u, f) => u + f * (u * (A + (1 - A) * Math.abs(u) ** B) - u)
const slope = (u, f) => 1 - f + f * (A + (1 - A) * (B + 1) * Math.abs(u) ** B)

/** The inverse: where inside the lens the point s underneath shows up. lens is increasing, so Newton converges fast. */
function whereItShows(s, f) {
  let u = s
  for (let i = 0; i < 5; i++) u = clamp(u - (lens(u, f) - s) / slope(u, f), -1, 1)
  return u
}

const SVG = 'http://www.w3.org/2000/svg'

/**
 * Replaces every circle and path of the icons in `layer` with a path made of many points
 * (in viewBox units), so it can be bent point by point and stay crisp. The original is hidden.
 * Limitation: subpaths are split on absolute 'M' only; icons with relative 'm' need a real path parser.
 */
function sample(layer) {
  const shapes = []
  for (const svg of layer.querySelectorAll('svg')) {
    for (const original of [...svg.querySelectorAll('circle, path')]) {
      const ds = original instanceof SVGPathElement ? (original.getAttribute('d') ?? '').split(/(?=M)/) : [null]
      const parts = ds.map((d) => {
        let shape = original
        if (d !== null) {
          shape = document.createElementNS(SVG, 'path')
          shape.setAttribute('d', d)
          svg.appendChild(shape)
        }
        const length = shape.getTotalLength()
        const n = Math.max(4, Math.ceil(length / 0.4))
        const points = Array.from({ length: n + 1 }, (_, i) => {
          const p = shape.getPointAtLength((length * i) / n)
          return [p.x, p.y]
        })
        if (shape !== original) shape.remove()
        return { points, closed: d === null || /z\s*$/i.test(d) }
      })
      const bent = document.createElementNS(SVG, 'path')
      for (const a of original.getAttributeNames()) {
        if (!['d', 'cx', 'cy', 'r'].includes(a)) bent.setAttribute(a, original.getAttribute(a) ?? '')
      }
      original.after(bent)
      original.style.display = 'none'
      shapes.push({ svg, original, bent, parts })
    }
  }
  return shapes
}

/**
 * A glass segmented control, like iOS 26: a piece of glass resting on the selected option.
 * - Pick it up and slide it: it inflates past the bar, tracks the finger, stretches with velocity
 *   and rubber-bands at the ends. On release it settles on the nearest option.
 * - Tap another option: the lens travels there by itself, lifting a little on the way.
 * - Keyboard and screen readers use the real radio buttons underneath.
 *
 * `box` is a <fieldset> of <label><input type="radio"><svg width height viewBox>…</svg></label>.
 * Returns { goTo(index), destroy() }.
 */
export function createGlassLens(box, onChange) {
  const labels = [...box.querySelectorAll('label')]
  const inputs = labels.map((l) => l.querySelector('input'))

  // The glass and the two visible copies of the icons (plain, and tinted + bent inside the lens).
  const glass = document.createElement('span')
  glass.className = 'glass-lens__glass'
  glass.setAttribute('aria-hidden', 'true')
  const copy = (className) => {
    const layer = document.createElement('span')
    layer.className = className
    layer.setAttribute('aria-hidden', 'true')
    for (const label of labels) {
      const cell = document.createElement('span')
      cell.append(label.querySelector('svg').cloneNode(true))
      layer.append(cell)
    }
    return layer
  }
  const icons = copy('glass-lens__icons')
  const tint = copy('glass-lens__tint')
  box.prepend(glass, icons, tint)

  let options = [0]
  let left = 0
  let width = 0
  let height = 0
  let tintWidth = 0
  const shapes = sample(tint)
  /** Where each icon sits inside the tinted layer: origin in px and px per viewBox unit. */
  const places = new Map()
  let bentLastFrame = true // the first draw builds the paths even at rest
  let x = 0
  let vx = 0
  let target = 0
  let lift = 0
  let liftVel = 0
  let grab = null // { pointer, startX, dragging }

  function measure() {
    if (!labels.length) return
    // offset* rather than getBoundingClientRect: an entrance scale on a parent would skew the sizes.
    const first = labels[0]
    left = first.getBoundingClientRect().left
    width = first.offsetWidth
    height = first.offsetHeight
    options = labels.map((l) => l.offsetLeft - first.offsetLeft)
    for (const layer of [glass, icons, tint]) {
      layer.style.left = `${first.offsetLeft}px`
      layer.style.top = `${first.offsetTop}px`
    }
    glass.style.width = `${width}px`
    glass.style.height = `${height}px`
    tintWidth = tint.offsetWidth
    for (const { svg } of shapes) {
      const cell = svg.parentElement
      const side = svg.width.baseVal.value
      places.set(svg, {
        ox: cell.offsetLeft + (cell.offsetWidth - side) / 2,
        oy: cell.offsetTop + (cell.offsetHeight - svg.height.baseVal.value) / 2,
        k: side / (svg.viewBox.baseVal?.width || side),
      })
    }
  }

  /** Redraws the tinted icons bent by the lens (center and half sizes in px of the layer). */
  function bend(cx, cy, hw, hh, f) {
    if ((f <= 0 && !bentLastFrame) || !places.size) return
    bentLastFrame = f > 0
    // Radial from the center, measured against the pill's boundary in that direction: the rim always maps
    // to the rim (no cuts at the rounded ends) and every point stays on its own ray.
    const r = Math.min(hw, hh)
    const straight = Math.abs(hw - hh) // half length of the straight segment
    const wide = hw >= hh
    const warp = (X, Y) => {
      const dx = X - cx
      const dy = Y - cy
      const d = Math.hypot(dx, dy)
      if (!d) return [X, Y]
      const a = Math.abs(wide ? dx : dy) / d // component along the pill
      const b = Math.abs(wide ? dy : dx) / d // component across it
      const flat = b > 0 ? r / b : Infinity
      const edge = flat * a <= straight ? flat : a * straight + Math.sqrt(Math.max(0, r * r - straight * straight * b * b))
      const u = d / edge
      if (u >= 1) return [X, Y]
      const k = whereItShows(u, f) / u
      return [cx + dx * k, cy + dy * k]
    }
    for (const s of shapes) {
      const p = places.get(s.svg)
      if (!p) continue
      s.bent.setAttribute(
        'd',
        s.parts
          .map(({ points, closed }) => {
            const ps = points.map(([px, py]) => {
              const [X, Y] = warp(p.ox + px * p.k, p.oy + py * p.k)
              return `${((X - p.ox) / p.k).toFixed(2)} ${((Y - p.oy) / p.k).toFixed(2)}`
            })
            return `M${ps.join('L')}${closed ? 'Z' : ''}`
          })
          .join(''),
      )
    }
  }

  /** Under the finger, centered; past the ends it gets harder and harder. */
  function underFinger(clientX) {
    const v = clientX - left - width / 2
    const max = options[options.length - 1]
    if (v < 0) return -rubberBand(-v, 8)
    if (v > max) return max + rubberBand(v - max, 8)
    return v
  }

  const nearest = (v) => options.reduce((best, o, i) => (Math.abs(o - v) < Math.abs(options[best] - v) ? i : best), 0)

  function draw() {
    // Stretches along the travel, more the faster it goes, and thins in height.
    const speed = Math.min(Math.abs(vx) / 1500, grab?.dragging ? 0.35 : 0.22)
    // Picked up, it grows past the bar.
    const s = 1 + clamp(lift, 0, 1.2) * 0.32
    const sx = s * (1 + speed)
    const sy = s * (1 - speed * 0.4)
    glass.style.translate = `${x.toFixed(2)}px 0`
    glass.style.scale = `${sx.toFixed(4)} ${sy.toFixed(4)}`

    // Tinted layer: clipped to exactly the glass shape (magnification comes from the refraction inside).
    const center = x + width / 2
    const hw = (width / 2) * sx
    const hh = (height / 2) * sy
    const top = height / 2 - hh
    const n = (v) => v.toFixed(2)
    tint.style.clipPath = `inset(${n(top)}px ${n(tintWidth - center - hw)}px ${n(top)}px ${n(center - hw)}px round 999px)`

    bend(center, height / 2, hw, hh, clamp(lift, 0, 1))

    // Plain icons: everything except the glass shape (a pill), so they never show under the tinted copy.
    const r = Math.min(hh, hw)
    const cy = height / 2
    icons.style.clipPath =
      `path(evenodd, 'M-40 -40 H${n(tintWidth + 40)} V${n(height + 40)} H-40 Z ` +
      `M${n(center - hw + r)} ${n(cy - hh)} H${n(center + hw - r)} A${n(r)} ${n(r)} 0 0 1 ${n(center + hw - r)} ${n(cy + hh)} ` +
      `H${n(center - hw + r)} A${n(r)} ${n(r)} 0 0 1 ${n(center - hw + r)} ${n(cy - hh)} Z')`
  }

  const loop = createLoop(
    (dt) => {
      const held = !!grab?.dragging
      ;[x, vx] = step(held ? HELD : SLIDE, x, vx, target, dt)
      // Held: fully lifted. Traveling alone: lifts in proportion to the distance left and lands on arrival.
      const goal = held ? 1 : clamp(Math.abs(target - x) / Math.max(width, 1), 0, 1) * LIFT
      ;[lift, liftVel] = step(goal > lift ? INFLATE : DEFLATE, lift, liftVel, goal, dt)
    },
    () => {
      const held = !!grab?.dragging
      const still =
        !held && Math.abs(x - target) < 0.05 && Math.abs(vx) < 0.05 && Math.abs(lift) < 0.002 && Math.abs(liftVel) < 0.02
      if (still) {
        x = target
        vx = 0
        lift = 0
        liftVel = 0
      }
      // Lifted while traveling alone, it looks like a lens; when it lands it is the resting pill again.
      if (!held && lift > 0.12) box.dataset.traveling = ''
      else delete box.dataset.traveling
      draw()
      return !still
    },
  )

  function goTo(index, instant = false) {
    measure()
    target = options[index] ?? 0
    if (instant || reducedMotion.matches) {
      x = target
      vx = 0
      draw()
    } else if (!grab) {
      loop.start()
    }
  }

  function pickUp(clientX) {
    if (!grab) return
    grab.dragging = true
    box.dataset.dragging = ''
    target = underFinger(clientX)
    if (!reducedMotion.matches) loop.start()
  }

  function onDown(e) {
    if (grab || e.button !== 0) return
    measure()
    grab = { pointer: e.pointerId, startX: e.clientX, dragging: false }
    // Captured, the release arrives here even if the finger leaves the control. The native click then lands on
    // the fieldset and changes nothing; the choice is made on release. Keyboard keeps the native radios.
    box.setPointerCapture(e.pointerId)
    // On the glass it is picked up at once; on another option wait: if the finger doesn't move, it is a tap.
    if (Math.abs(underFinger(e.clientX) - x) < width / 2) pickUp(e.clientX)
  }

  function onMove(e) {
    if (!grab || e.pointerId !== grab.pointer) return
    if (!grab.dragging) {
      if (Math.abs(e.clientX - grab.startX) >= DRAG_THRESHOLD) pickUp(e.clientX)
      return
    }
    target = underFinger(e.clientX)
    if (reducedMotion.matches) {
      x = target
      draw()
    }
  }

  function choose(index) {
    inputs[index].checked = true
    goTo(index)
    onChange?.(index)
  }

  function onUp(e) {
    if (!grab || e.pointerId !== grab.pointer) return
    const tap = !grab.dragging
    grab = null
    delete box.dataset.dragging
    // Tap: travel alone to the tapped option. Drag: settle on the option nearest to where it was dropped.
    choose(nearest(tap ? underFinger(e.clientX) : target))
  }

  function onKeyboard(e) {
    const index = inputs.indexOf(e.target)
    if (index < 0) return
    goTo(index)
    onChange?.(index)
  }

  box.addEventListener('pointerdown', onDown)
  box.addEventListener('pointermove', onMove)
  box.addEventListener('pointerup', onUp)
  box.addEventListener('pointercancel', onUp)
  box.addEventListener('change', onKeyboard)

  // Before the first paint: the glass starts on the selected option instead of sliding in from the first.
  goTo(Math.max(0, inputs.findIndex((i) => i.checked)), true)

  return {
    goTo,
    destroy() {
      box.removeEventListener('pointerdown', onDown)
      box.removeEventListener('pointermove', onMove)
      box.removeEventListener('pointerup', onUp)
      box.removeEventListener('pointercancel', onUp)
      box.removeEventListener('change', onKeyboard)
      loop.stop()
      for (const s of shapes) {
        s.bent.remove()
        s.original.style.display = ''
      }
      glass.remove()
      icons.remove()
      tint.remove()
    },
  }
}

/* ------------------------------------------------------------------ */
/* Inline field messages                                               */
/* ------------------------------------------------------------------ */

function message(field) {
  const v = field.validity
  if (v.valueMissing) return 'Please fill this in'
  if (v.typeMismatch && field.type === 'email') return "That email doesn't look right"
  if (v.tooShort) return `Use at least ${field.minLength} characters`
  // A pattern can bring its own text in data-message.
  if (v.patternMismatch) return field.dataset.message ?? 'Check what you typed'
  return field.validationMessage
}

/**
 * Replaces the browser's validation bubble with a message under the field, in the glass style.
 * Native validation (required, minlength, type, pattern) still runs and still blocks the submit;
 * only the way it is shown changes. The text goes in data-message on the <label>, which CSS shows below the field.
 */
export function enableFieldMessages(root = '.glass-card') {
  const fields = `${root} input, ${root} select, ${root} textarea`
  let focused = false

  document.addEventListener(
    'invalid',
    (e) => {
      const field = e.target
      if (!(field instanceof Element) || !field.matches(fields)) return
      const label = field.closest('label')
      if (!label) return
      e.preventDefault() // no browser bubble
      label.dataset.message = message(field)
      field.setAttribute('aria-invalid', 'true')
      // Restart the shake even if it was already marked.
      delete label.dataset.shake
      void label.offsetWidth
      label.dataset.shake = ''
      // All invalid fields of one submit arrive together: focus the first one.
      // setTimeout, not a microtask: microtasks already run between one invalid event and the next.
      if (!focused) {
        focused = true
        field.focus()
        setTimeout(() => (focused = false))
      }
    },
    true,
  )

  document.addEventListener('input', (e) => {
    const field = e.target
    if (!(field instanceof Element) || !field.matches(fields)) return
    const label = field.closest('label')
    if (!label?.dataset.message) return
    if (field.validity.valid) {
      delete label.dataset.message
      delete label.dataset.shake
      field.removeAttribute('aria-invalid')
    } else {
      label.dataset.message = message(field)
    }
  })
}
