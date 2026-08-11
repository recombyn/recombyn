# Brush / pencil

Craft for **brush / pencil / 板绘 / 线稿 / pressure drawing** — freehand when the brief wants drawn marks. Medium follows the job: pressure strokes vs simple vector vs complex bitmap.

## Design thinking

| Ask | Aim |
|-----|-----|
| **Is brush right?** | Sketch / ink / chalk — or UI chrome / photo hero / icons instead? |
| **Tone** | One drawn language per pass |
| **Tip family** | Sketch ≠ calligraphy ≠ marker — pick one |
| **Bitmap vs vector vs brush** | Pressure / expressive freehand → brush. Simple precise geometry → vector. Complex photo/atmosphere → bitmap. Soft-avoid faking brush with ellipse piles |
| **Economy** | Few confident strokes over timid spam |

Quality bar: **intentional design** — silhouette reads; pressure varies.

## Stroke & composition

- Keep strokes on the current artboard.
- Plan a small budget (~3–12 strokes for a mark cluster).
- Pressure: lighter ends, heavier mid — soft-avoid uniform stamp dots.
- Far check silhouette; near check pressure. Refine before rebuilding as geometry.

## Tip → intent

| Tip | Lean |
|-----|------|
| `pencil-hb` / `needle` | Sketch / 线稿 |
| `fountain` / `calligraphy` / `brushpen` | Ink flourishes |
| `marker` / `highlighter` | Broad marks / wash |
| `chalk` / `charcoal` / `bristle` | Texture |
| `soft` / `watercolor` / `airbrush` | Soft edges |
| `solid` / `bold` | Graphic marks, still pressure-aware |

## When another medium fits better

| Need | Prefer |
|------|--------|
| Simple precise geometry / icons | shape tools / `icon_set` |
| UI chrome | `shadcn_ui` |
| Complex photo / rich atmosphere | `image_gen` / `poster_craft` |
| Looping motion | `motion_lottie` |

## Honesty

Soft-avoid using brush as a stand-in for missing fonts or icons. Soft-avoid covering a poster subject with scribble noise.

## Place on board

Confirm freehand → pick tip → draw with pressure → refine. Soft-avoid deleting an artboard when only cleaning strokes.

## Related

`image_gen`, `poster_craft`, `icon_set`

## Done when

Silhouette reads; pressure varies; tip matches intent; strokes stay on board.
