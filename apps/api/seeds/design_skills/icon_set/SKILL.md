# Icon / mark set

Playbook for **图标 / icon set / favicon / UI glyph** — static vector consistency, not illustration posters.

## Principles
1. **One system** — shared optical size, stroke weight, corner radius, filled vs outline rule.
2. **Grid first** — frame each mark on the same cell (e.g. 64 / 96 / 128); align to a keyline grid.
3. **Vector over bitmap** — prefer vector shapes/SVG; bitmap only for textured/brand marks the user requested.
4. **No emoji tofu** — never use emoji characters as icons.

## Workflow
1. Lock cell size + columns (e.g. 4×2 grid). Outer artboard optional for the sheet.
2. State the system in one line (outline 2px / rounded 4 / monochrome ink).
3. Build 4–8 marks with identical stroke/fill rules; label under each with small catalog type.
4. Optical balance: round glyphs slightly oversized vs square; keep equal visual weight.
5. Self-check: no mixed styles, no clipped paths, labels readable.

## Set recipes
| Ask | Deliver |
|-----|---------|
| App icon | Single mark + simple plate; avoid tiny detail that dies at 32px |
| UI glyph set | Outline or filled family; draw larger for craft |
| Favicon | Ultra-simple silhouette; 1–2 shapes max |

## Avoid
- Lottie for static icons
- Rainbow random fills per icon in one set
- Photoreal collage as “icon set”
