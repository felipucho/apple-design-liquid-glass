# Apple Design + Liquid Glass

An agent skill for building Apple-style interfaces on the web, with a deep section on **iOS 26 Liquid Glass**: glass buttons you can press and stretch, a glass lens that slides over a segmented control and bends what is under it, rim light, a trace of rainbow, glass surfaces that materialize, and the small things around them (first paint, form errors).

> **Based on [`apple-design`](https://github.com/emilkowalski/skills/tree/main/skills/apple-design) by [Emil Kowalski](https://emilkowal.ski)**, from his [Skills for Designers and Engineers](https://github.com/emilkowalski/skills) (MIT). His skill is included unchanged as sections 1–17. Everything about Liquid Glass is added on top of it. If you only need Apple's motion principles, use his original.

## Install

```bash
npx skills@latest add felipucho/apple-design-liquid-glass
```

Or copy [`skills/apple-design-liquid-glass`](./skills/apple-design-liquid-glass) into your agent's skills folder (for Claude Code: `~/.claude/skills/`).

## What's added

Emil's skill covers Apple's motion and design principles: springs, interruptibility, velocity handoff, momentum, materials and typography. What it doesn't cover is how **Liquid Glass** actually behaves when you build it by hand. These rules came from rebuilding it and comparing it with the real thing, one detail at a time:

| Topic | The rule, in one line |
| --- | --- |
| Two kinds of glass | A glass **button** deforms in place. A glass **lens** is a separate piece you pick up and slide. |
| Glass buttons | Inflate on press, then stretch toward the finger like a droplet. The opposite edge stays anchored, the shape stays a capsule, and the way back mirrors the way out. |
| Two springs | Stiff with no bounce while held, a single wobble when released, and interruptible mid-wobble. |
| The lens | Grows past the bar and turns clear when picked up. A tap makes it travel by itself, lifting and landing. A press on it grabs it at once. |
| Refraction | A real lens shows only what is under it, and each thing once. Use a bijective radial map measured against the pill's edge. |
| Vectors, not pixels | Bend the icon paths point by point. Displacement filters pixelate small icons and shatter them into dots. |
| Color | Rainbow only as a 1px rim at two corners, at ~45%. Never split RGB on the content, or white icons explode. |
| Consistency | Buttons and the lens share the rim light, the ring and the rhythm. Pointer light accompanies and never calls attention. |
| Arrival | Glass surfaces materialize (blur grows as they rise), then their content staggers in. |
| First paint | The theme applies before the first paint: no white flash, no "Loading…" text. |
| Form errors | An inline message under the field with a tiny iOS-style shake, instead of the browser bubble. |
| Switches | iOS 26 size: a 63 × 28pt track with a 37 × 24pt pill thumb, not the old 51 × 31 with a round one. The pressed thumb is a small lens. |
| Settings lists | Capsule cards 20pt from the edges, 52pt rows, the footer explains the consequence. |
| Open menus | One blurred glass panel that grows out of its control, a checkmark as the only selection mark, no separators. |

The rules with their numbers are in [SKILL.md § 18](./skills/apple-design-liquid-glass/SKILL.md#18-liquid-glass--glass-you-can-touch). The full recipes, with the mistake behind each rule, are in [LIQUID-GLASS.md](./skills/apple-design-liquid-glass/LIQUID-GLASS.md).

## Demo

[`demo/`](./demo) is a working implementation with no dependencies and no build step:

- `glass.js`: `enableGlassButtons()`, `createGlassLens()` and `enableFieldMessages()`.
- `glass.css`: the tokens and styles, in light and dark, with reduced motion, reduced transparency and increased contrast.
- `index.html`: a glass sign-in card with stretchy buttons, a theme switch whose selection is a glass lens, and inline field errors.

ES modules need a server, so serve the folder rather than opening the file:

```bash
npx serve demo
```

Press and drag the buttons. Pick up the glass in the theme switch and slide it, or tap another option and watch it travel.

## Credits

- [Emil Kowalski](https://github.com/emilkowalski) for `apple-design` and the rest of [emilkowalski/skills](https://github.com/emilkowalski/skills).
- Apple's WWDC design talks, which his skill distills.

## License

[MIT](./LICENSE). It keeps Emil Kowalski's copyright for the original skill.
