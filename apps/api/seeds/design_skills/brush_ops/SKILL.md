# Brush / pencil

Playbook for **brush / pencil / 板绘 / 线稿 / pressure drawing** — expressive freehand on canvas, not geometric shape collage.

Mature craft (illustration + digital inking): pressure narrative, tip economy, stroke confidence — executed via pencil `create_shape`, not React or SVG path artistry by hand.

## Principles
1. **Pressure tells the story** — light start/end, heavier mid; flat pressure reads as stamp spam.
2. **Tip matches intent** — sketch ≠ calligraphy ≠ marker; pick one tip family per pass.
3. **Stroke economy** — fewer confident strokes beat dozens of timid ones (ink tradition).
4. **Never fake brush with geometry** — circle/ellipse piles are not drawing.
5. **Stay inside FOCUS** — all strokes clip to the artboard frame.

## Workflow
1. Confirm the brief needs freehand (sketch, ink flourish, chalk mark, highlight) — not UI chrome or poster hero.
2. `create_frame` if missing; keep strokes inside FOCUS.
3. Choose tip + hardness; plan 3–12 strokes max for a mark cluster.
4. Emit `create_shape` with `shapeType=pencil` + path + pathPressure + stroke.
5. Far check: silhouette readable; near check: pressure varies, no C/Q path mistakes.
6. Refine with `update_node` on the same pencil node or add companion strokes.

## Ops (required)
Emit `create_shape` with `shapeType=pencil` (**not** circle/ellipse stamp piles).

Paint is **tip-stamp** (not freehand ribbon):
| Arg | Rule |
|-----|------|
| `path` | SVG **M/L polyline only** (pressure/stamp ignore C/Q) |
| `pathPressure` | csv `0.05–1`, length MUST equal # of M/L points |
| `brushStyle` | tip id (table below) |
| `brushHardness` | 0–100 optional (soft→hard; default ~80) |
| `pressureEnabled` | true\|false (default true when pathPressure set) |
| `stroke` + `borderWidth` | always set |

## Tip → intent
| Tip | Lean |
|-----|------|
| `pencil-hb` / `needle` | Sketch / 线稿; thin; vary pressure; breathing room |
| `fountain` / `calligraphy` / `brushpen` | Ink flourishes; fewer confident strokes |
| `marker` / `highlighter` | Broad marks; opacity for wash feel |
| `chalk` / `charcoal` / `bristle` | Texture; darker mid-stroke |
| `soft` / `watercolor` / `airbrush` | Soft edges; lower hardness |
| `solid` / `bold` | Graphic poster marks; still pressure-aware |

## When NOT brush
| Need | Prefer |
|------|--------|
| UI chrome / cards / buttons | `shadcn_ui` + shapes |
| Festive / photo hero | `image_gen` / `poster_craft` |
| Looping motion | `motion_lottie` |
| Precise geometry | `create_shape` rect/ellipse/line (non-pencil) |

## Do not
- Rebuild brush art as ellipse/circle piles
- Use C/Q curves expecting pressure sampling
- Invent node ids; mismatch pathPressure length vs points
- Cover a poster subject with scribble noise
- Use brush as a substitute for missing fonts or icons

## Edit
Refine with `update_node` on the same pencil node; or add companion strokes. Do not delete-and-rebuild as geometry.

Args detail: TOOL_DETAILS for `create_shape`.

## Done when
Silhouette reads at a glance; pressure narrative is visible; tip matches intent; all strokes inside FOCUS; SCENE ids only.
