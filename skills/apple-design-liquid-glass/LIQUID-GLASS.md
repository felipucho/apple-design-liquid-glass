# Liquid Glass on the web — recipes and rules

Companion to section 18 of [SKILL.md](./SKILL.md). These rules came from rebuilding iOS 26 Liquid Glass controls by hand and comparing them, frame by frame, with the real ones (Apple Music's tab bar and segmented controls, iOS buttons). Each rule says **what to do**, **the numbers that felt right**, and **the mistake that taught it**.

A complete, dependency-free implementation lives in the repository's [`demo/`](https://github.com/felipucho/apple-design-liquid-glass/tree/main/demo) folder: `glass.js` (motion), `glass.css` (looks) and `index.html`.

## 0. The mental model

Liquid Glass is **a physical object lying on top of the content**. Before writing any effect, ask: *what would a real piece of glass do here?*

- Glass doesn't teleport. It lifts, travels and lands.
- Glass doesn't duplicate what is under it, and it doesn't hide it.
- Glass bends light at its edge, with only a trace of color.
- Glass is firm. It gives a little when pushed and springs back.

There are two kinds of glass, and they must not be confused:

| | Glass control (button) | Glass lens (segmented control, tab bar) |
| --- | --- | --- |
| What is glass | The control itself | A separate piece resting on static content |
| On press | Inflates in place, lights up under the finger | Picked up: grows past the bar and turns clear |
| On drag | Stretches toward the finger, barely moves | Slides with the finger and bends what is under it |
| On release | Wobbles back to its shape | Settles on the nearest option |

Mistake that taught this: making the segmented control's *icons* stretch like buttons. In iOS the icons never move. Only the glass on top of them does.

## 1. Springs, frame by frame

Everything is driven by damped springs integrated in a `requestAnimationFrame` loop. Don't use CSS transitions for anything the finger touches.

```js
// unit mass, semi-implicit Euler: stable with a small dt
function step({ stiffness, damping }, pos, vel, target, dt) {
  const v = vel + (stiffness * (target - pos) - damping * vel) * dt
  return [pos + v * dt, v]
}
// per frame: cap dt at 1/30 s (a dropped frame or background tab can't fling it), integrate in 1/120 s substeps
```

| Spring | Stiffness | Damping | Feel |
| --- | --- | --- | --- |
| Held (follows the finger) | 700 | 46 | Close tracking, no bounce |
| Released (back to shape) | 420 | 15 | One visible wobble |
| Inflate on press | 520 | 30 | Quick, tiny overshoot |
| Deflate | 420 | 22 | Settles without a bounce |
| Lens settling on an option | 150 | 23 | Slower, a little give |

- **Two springs for one gesture.** While held, the glass must feel attached, so use a stiff spring with no bounce. After release it is free, so let it wobble. One spring for both reads either mushy (while held) or dead (after release).
- **Interruptible.** Pressing again while it still wobbles continues from the current position and velocity. Never reset to zero.
- Write the individual `translate` and `scale` properties, not `transform`. Then a CSS entrance animation, or anything else using `transform`, keeps working.

## 2. Glass buttons

### Press
- Inflate on **pointer-down**: ~10px on the long side, capped at 8% for small controls (`1 + press · min(0.08, 10 / max(w, h))`).
- Light up under the finger: a radial highlight at `--x / --y`, with its opacity driven by the same spring (`--press`).
- Pressed, a text button becomes a **glass capsule**: a translucent fill, the shared rim light, a light blur, and the faint rainbow ring. It must happen on *press*, not only on hover. Touch screens have no hover, so a hover-only capsule means nothing visible happens on a phone.

### Drag while held: stretch, don't move
The button stays where it is and **grows toward the finger like a droplet**.

```js
const pull = rubberBand(distance, 17)             // px; resistance grows with distance
const growX = softCap(|pull.x| · 0.9, 0.21 · w)   // growth per axis, soft-capped
const growY = softCap(|pull.y| · 0.9, 0.21 · h)
const sx = inflate · (1 + growX/w) · (1 − (growY/h) · 0.225)  // thin the other axis a little
const sy = inflate · (1 + growY/h) · (1 − (growX/w) · 0.225)
const tx = pull.x · 0.1 + sign(pull.x) · growX · inflate / 2  // shift half the growth: opposite edge stays put
```

| Rule | Why (the mistake) |
| --- | --- |
| Opposite edge anchored; the body follows only ~10% of the pull | When the whole button slid around, it read as a draggable card, not glass. |
| Grow **each axis independently** from that axis' pull | Stretching along the pull *angle* skewed the capsule into a parallelogram. Computing a single "along/across" stretch with the short side dominating made diagonal drags collapse into up/down. A real capsule stays a capsule and just grows in both directions. |
| Thin the other axis slightly | Volume seems conserved. Without thinning, it looks inflated instead of pulled. |
| Rubber band `L·(1 − e^(−d / 3.5L))`, reaching 90% only at ~8×L | A band that saturates early (84% at 100px) doesn't shrink as the finger comes back until it is very close, so the way back doesn't mirror the way out. |
| Soft caps (`max · tanh(v / max)`), never `Math.min` | A hard clamp creates a dead zone where moving the finger changes nothing, and it breaks the return path the same way. |
| Small pulls give small changes | The first version felt "very soft": it moved a lot for a small pull. It was tuned down in ~20% steps, then made 50% firmer. Make the button firm, with the deformation subtle. |

- On release outside the button, nothing activates (native click semantics already do this). Coming back over it before releasing still activates it.
- Keyboard activation doesn't animate.
- Set `touch-action: pan-y` on the button: horizontal drags stretch it, vertical drags still scroll the page.
- `prefers-reduced-motion`: no stretch at all.

### Which buttons
- **Primary (tinted):** keeps its color. It gets the motion and the rainbow ring, but not the glass capsule.
- **Third-party brand buttons** (for example "Sign in with Google"): they get the motion, but keep the official look. Never add a glass highlight to them.
- **List rows** (iOS Settings-style lists): highlight the row, don't stretch it.

## 3. The glass lens (segmented control, tab bar)

### Structure
```
fieldset.glass-lens            ← pointer capture lives here
  span.glass-lens__glass       ← the piece of glass (moved with translate/scale)
  span.glass-lens__icons       ← visible copy of the icons, with a hole the shape of the glass
  span.glass-lens__tint        ← visible copy in the accent color, clipped to the glass, bent by the lens
  label > input[type=radio] + svg (hidden) + text (sr-only)   ← the real controls
```
The visible icons are `aria-hidden` copies that ignore the pointer. The real radios stay underneath, so keyboard, focus and screen readers work natively.

### States
| State | Look |
| --- | --- |
| At rest | A translucent pill behind the selected option (`rgb(0 0 0 / .07)` in light mode, `rgb(255 255 255 / .13)` in dark). The selected icon is in the accent color. |
| Picked up (dragging) | It grows past the bar (`scale ≈ 1.32`) and turns **clear glass**: almost no fill, no frosting (`backdrop-filter: saturate(160%) brightness(1.04)`, no blur). It gets the rim light top and bottom, a soft shadow and the faint rainbow ring, and sits above the icons. |
| Traveling alone (after a tap) | Same lens look while it is lifted more than ~12%. It becomes the resting pill again when it lands. |

### Gestures
- **Press on the lens:** pick it up immediately, with no threshold.
- **Press on another option:** wait. If the finger moves ≥6px, pick up the lens and drag. Otherwise it is a tap.
- **Dragging:** the lens tracks the finger with the held spring. It stretches with velocity (`sx = 1 + min(|v| / 1500, 0.35)`, `sy = 1 − 0.4·that`). Past the first and last option it rubber-bands, with an 8px limit.
- **Release after a drag:** settle on the option nearest to where it was dropped.
- **Tap:** the lens **travels by itself**. It lifts in proportion to the distance left (`lift = 0.75 · min(1, |target − x| / width)`), so it inflates on the way and deflates as it arrives. Cap the velocity stretch lower (`0.22`). Measured from the first option to the last: ≈×1.07 at the start, ≈×1.5 wide and ×1.14 tall mid-way, ≈×1.06 arriving. It shows the lens look for ~250ms and is fully still at ~700ms.

Mistake that taught the tap rule: treating a tap like a grab. The lens inflated fully, jumped under the finger and stretched up to 41%, which read as a glitch. On iOS the move from option to option is slow and soft: the glass lifts, travels and drops. It is almost unnoticeable.

### Shape
Make the lens a little elongated, about **50×32px** (2.75rem × 1.75rem). A square-ish lens doesn't read as the Apple Music tab bar.

### Initial position
Place the glass on the selected option **before the first paint** (in a layout effect, or synchronously after mount) with no animation. Otherwise it slides in from the first option on every load.

## 4. Refraction inside the lens

### Rule: a real lens shows only what is under it, and each thing exactly once
Every point inside the lens shows something that is under the lens, never something from outside. Every thing under the lens appears exactly once. That gives three hard constraints:

1. **No duplication.** If the edge pulls in content from just outside the lens, that content is visible twice, inside and outside. (This was the bug with a moon icon showing at the rim *and* next to the lens.)
2. **No gap.** If the edge pushes the center content outward ("negative refraction"), a lens resting between two items shows only empty space and hides both items. You must always see something.
3. **No extra zoom layer.** Scaling the whole tinted layer on top of the refraction pushes the icons out of the lens. Let the refraction do all the magnifying.

### The map
Along each ray from the center (`u = 0` center, `u = 1` rim), the point at `u` shows what is at `lens(u)`:

```js
const A = 0.82, B = 4
const lens  = (u, f) => u + f * (u * (A + (1 - A) * Math.abs(u) ** B) - u)
const slope = (u, f) => 1 - f + f * (A + (1 - A) * (B + 1) * Math.abs(u) ** B)
// inverse (where a point s underneath shows up), by Newton; lens is increasing so 5 iterations are plenty
function whereItShows(s, f) {
  let u = s
  for (let i = 0; i < 5; i++) u = clamp(u - (lens(u, f) - s) / slope(u, f), -1, 1)
  return u
}
```

- `lens(±1) = ±1` and `|lens(u)| ≤ |u|`: bijective, so there is no duplication and no gap.
- Center magnification `1/A ≈ 1.22`. The rim is compressed, so content near the edge looks **stretched outward**, like the thick edge of real glass.
- `f` is the strength: 0 at rest, 1 when picked up, following the lift spring. At rest nothing is recomputed.

### Measure against the pill, radially
Compute `u` as the distance from the center divided by the distance to the **pill's boundary along that same ray**. Each point moves only along its own ray.

Mistake: a separable warp (x and y bent independently, as if the lens were a rectangle). On the rounded ends, content just inside the curve was pushed past it and **cut off sharply** instead of bending.

### Bend vectors, not pixels
- An SVG `feDisplacementMap` on small icons rasterizes them. Under magnification they pixelate, and with a busy map they break into dots ("the image split into little dots"). Content should look smeared outward at the edge, not shattered.
- Instead: when the control is created, sample each icon path into points (`getTotalLength` / `getPointAtLength`, every ~0.4 viewBox units). Every frame, move each point with the map above and rebuild the path `d`. It is crisp at any size and needs no filter.
- Set `overflow: visible` on the warped SVGs. Magnified strokes extend past the icon's box, and the default clipping cut the icons off at the side while the lens slid over them.

### Two copies, two clips: nothing is seen twice
- **Plain icons:** clipped to everything *except* the glass shape (an `evenodd` path: a big rectangle minus the pill).
- **Tinted icons:** clipped to *exactly* the glass shape (`inset(... round 999px)`).
- Update both clips every frame from the glass' current translate and scale. When the lens sits between two options, each icon is tinted only in the part under the glass, just like Apple Music's tab bar.

## 5. Color: rim light and a trace of rainbow

- **Rim light** (one shared token, the same in light and dark):
  ```css
  --glass-rim: inset 0 1.5px 1px rgb(255 255 255 / .85), inset 0 -1.5px 1px rgb(255 255 255 / .5),
               inset 0 0 0 .5px rgb(255 255 255 / .4);
  ```
- **Rainbow only on the rim, and only a hint.** Use a 1px ring: a `conic-gradient` masked to the border with `mask-composite: exclude`. Give it color at **two opposite corners only** (pink/amber at the top-left, cyan/violet at the bottom-right), keep the rest of the rim clean, and use opacity ≈0.45. Show it only while the glass is active. On buttons, drive it by `--press` with no transition of its own, so it enters and leaves with the inflation.
- **Never chromatic-aberrate the content.** Displacing R, G and B with different strengths looks fine on black icons, because black has no color to split. White icons in dark mode explode into a full rainbow. Displace the content once, as a whole.
- **Dimmed icons: solid color plus `opacity` on the whole icon.** A translucent color (`rgb(… / .75)`) on an icon whose stroke and fill overlap (for example a half-filled circle) renders the overlap in a second tone, so the icon looks different inside and outside the lens. Use a solid `color` and set `opacity` on the `<svg>`.

## 6. Consistency and restraint

- **Apple makes everything alike.** Once the lens feels right, carry the same rim light, the same rainbow ring and the same spring rhythm over to every pressable glass element. A pressed button should look like a small lens.
- **Pointer-follow light accompanies, never calls attention.** Values that felt right:

  | Light | Opacity |
  | --- | --- |
  | Highlight inside a button on hover | 0.35 |
  | Same highlight while pressed | 0.6 |
  | Soft glow inside a glass card, around the pointer | 0.45 |
  | Card edge lighting up near the pointer | 0.75 (0.55 when not hovered) |

  At 0.8–1.0 it was "too exaggerated, it calls too much attention". Show it only with `@media (hover: hover) and (pointer: fine)`.

## 7. Glass surfaces arrive as material

A glass card (a sign-in sheet, a dialog) should **materialize**, not fade:

1. **The glass forms** (~750ms, strong ease-out). The surface rises 16px, scales from 0.95 to 1, and its `backdrop-filter` blur grows from 0 to 40px. Opacity reaches 1 in ~500ms.
   ```css
   .glass-card { transition: opacity 500ms var(--ease-out), transform 750ms var(--ease-out), backdrop-filter 750ms var(--ease-out); }
   @starting-style { .glass-card { opacity: 0; transform: scale(.95) translateY(16px); backdrop-filter: blur(0) saturate(100%); } }
   ```
2. **Then the content, top to bottom.** Each child fades up 8px and goes from `blur(3px)` to sharp in 600ms. The stagger starts at 140ms with 60ms steps, and everything is still at ~1s.
   ```css
   @keyframes glass-content-in { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } }
   .glass-card > * { animation: glass-content-in 600ms var(--ease-out) backwards; }
   ```
   Use `@keyframes` with `backwards` fill for the children, not transitions. Transitions would fight the buttons' own transitions and the `translate`/`scale` that the spring code writes.
- Reduced motion: just a fade, with no movement and no stagger.
- It is fine for this to be slower than the "keep UI under 300ms" rule. It happens once per screen, and a deliberate arrival is part of what makes it read as a material.

## 8. First paint: no flash, no "Loading…"

- **Apply the saved theme before anything paints.** A tiny classic `<script>` in `<head>` reads the saved choice (falling back to `prefers-color-scheme`) and sets `data-theme` on `<html>`. If your Content-Security-Policy forbids inline scripts, put it in a static file (`<script src="/theme-init.js">`). Keep it in sync with the app's theme module.
- **Give `<html>` its background from the first byte.** Use a small stylesheet in `<head>` with the background color per theme. Wrap it in `:where()` so it has zero specificity and the real styles override it later.
- **The splash is the first screen's background, with no text.** Replace "Loading…" with an empty element using `role="status"` and `aria-label="Loading"`, on the same background as the screen that appears next. The glass card then materializes on top of it with no jump in color.
- Offer **Light / Dark / Automatic**, where Automatic follows the system. Persist the choice per device.

## 9. Form errors in the glass style

The browser's "Please fill out this field" bubble breaks the illusion. Replace how errors are *shown*, and keep native validation:

- Listen to `invalid` in the **capture** phase on `document` and call `preventDefault()`. That removes the bubble, while `required`, `minlength`, `type` and `pattern` still block the submit.
- Put the message in a data attribute on the `<label>` and show it with `label::after { content: attr(data-message) }` under the field: small, in the error color, sliding in 4px over 280ms. Being inside the label, it is part of the field's accessible name. Also set `aria-invalid="true"`.
- The field gets the error color on its border plus a soft ring (`0 0 0 4px` of the error color at ~16%).
- **A tiny shake**, like a wrong passcode on iOS: 360ms, −5 → 4 → −2.5 → 1px. Restart it on every submit by removing the attribute, forcing a reflow (`void el.offsetWidth`) and adding it back. No shake with reduced motion.
- **Focus the first invalid field.** All `invalid` events of one submit arrive together. Guard with a flag reset in `setTimeout`, not in a microtask, because microtasks run between one `invalid` event and the next.
- Clear the message on `input` as soon as the field is valid. While it is still invalid, update the text.
- Write messages for people: "Please fill this in", "That email doesn't look right", "Use at least 8 characters". A `pattern` field brings its own text (for example "Enter the 6 digits of the code").

## 10. Verify by measuring, not by eyeballing

Glass bugs are subtle, and a screenshot hides most of them. Measure instead:

- **Stretch:** while dragging, read the button's edges every few px of pull. The opposite edge should move ≤4px. Compare the way out and the way back at the same distances: they must match.
- **Refraction:** count icon pixels inside the lens with the effect on and off, at three spots: on an option, between two options, and at the end. Between options, a count that is much lower means a gap. One that is higher than "off" means duplication.
- **Tap travel:** sample `translate` and `scale` every ~60ms and check the peak (≈1.5 × 1.14), the time it shows the lens look (~250ms) and the time it is fully still (~700ms).
- **Entrance and first paint:** sample computed `opacity`, `transform` and `backdrop-filter` every 100ms after load. Block the app bundle and check that the first paint already has the right theme and no text.
