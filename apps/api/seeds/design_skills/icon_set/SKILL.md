# Icon / mark set

Playbook for **图标 / icon set / favicon / UI glyph** — static vector consistency, not illustration posters.

## Principles
1. **One system** — shared optical size, stroke weight, corner radius, filled vs outline rule.
2. **Grid first** — frame each mark on the same cell (e.g. 64 / 96 / 128); align to a keyline grid.
3. **Vector over bitmap** — prefer clean vector marks; bitmap only for textured/brand marks the user requested.
4. **Real glyphs only** — every mark is drawn geometry. Never emoji, pictograph characters, or a lone text character as the icon.

## Marks & labels
| Role | Craft |
|------|-------|
| Mark | One compact vector glyph per requested icon (shared stroke / corner language) |
| Label | Optional small plain text under the mark — labels never replace marks |
| Sheet | One artboard / grid board for the set when creating multiple icons |

Empty or placeholder marks are not allowed — each glyph must have real paths/geometry.

**Budget:** one solid glyph per mark (not a pile of tiny strokes). Eight marks plus labels should stay readable and even.

## Workflow
1. Lock cell size + columns (e.g. 4×2 grid). Outer artboard optional for the sheet.
2. State the system in one line (outline 2px / rounded 4 / monochrome ink).
3. For **each** requested mark: draw the vector glyph first, then optional label.
4. Optical balance: round glyphs slightly oversized vs square; keep equal visual weight.
5. Self-check: N marks = N vector glyphs; no emoji; no mixed styles; labels readable.

## Set recipes
| Ask | Deliver |
|-----|---------|
| App icon | Single mark + simple plate; avoid tiny detail that dies at 32px |
| UI glyph set | Outline or filled family; draw larger for craft |
| Favicon | Ultra-simple silhouette; 1–2 shapes max |

## Avoid
- Emoji / 🏠🔍❤️ / “icon font” text as marks
- Motion/Lottie for static icons
- Rainbow random fills per icon in one set
- Photoreal collage as “icon set”
- Only labels with no vector mark
