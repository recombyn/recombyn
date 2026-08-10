# Brush / pencil

Playbook for **brush / pencil / 板绘 / 线稿 / pressure drawing** — expressive freehand, not geometric shape collage.

Host args for the pencil brush live in TOOL_DETAILS — this skill owns craft intent and tip choice.

## Principles
1. **Pressure tells the story** — light start/end, heavier mid; flat pressure reads as stamp spam.
2. **Tip matches intent** — sketch ≠ calligraphy ≠ marker; pick one tip family per pass.
3. **Stroke economy** — fewer confident strokes beat dozens of timid ones.
4. **Never fake brush with geometry** — circle/ellipse piles are not drawing.
5. **Stay inside the artboard** — all strokes clip to FOCUS.

## Workflow
1. Confirm the brief needs freehand (sketch, ink flourish, chalk mark) — not UI chrome or poster hero.
2. Lock artboard if missing; keep strokes inside FOCUS.
3. Choose tip + hardness; plan 3–12 strokes max for a mark cluster.
4. Draw with the pencil brush tool (polyline + matching pressure samples — see TOOL_DETAILS).
5. Far check: silhouette readable; near check: pressure varies.
6. Refine the same stroke or add companion strokes — do not rebuild as geometry.

## Tip → intent
| Tip | Lean |
|-----|------|
| `pencil-hb` / `needle` | Sketch / 线稿; thin; vary pressure |
| `fountain` / `calligraphy` / `brushpen` | Ink flourishes; fewer confident strokes |
| `marker` / `highlighter` | Broad marks; opacity for wash feel |
| `chalk` / `charcoal` / `bristle` | Texture; darker mid-stroke |
| `soft` / `watercolor` / `airbrush` | Soft edges; lower hardness |
| `solid` / `bold` | Graphic poster marks; still pressure-aware |

## When NOT brush
| Need | Prefer |
|------|--------|
| UI chrome / cards / buttons | `shadcn_ui` |
| Festive / photo hero | `image_gen` / `poster_craft` |
| Looping motion | `motion_lottie` |
| Precise geometry | rect / ellipse / line shapes |

## Do not
- Rebuild brush art as ellipse/circle piles
- Use curve commands expecting pressure sampling (polyline only)
- Cover a poster subject with scribble noise
- Use brush as a substitute for missing fonts or icons

## Done when
Silhouette reads at a glance; pressure varies; tip matches intent; strokes stay inside FOCUS.

## Edit / color intent
When the user asks to keep one color and remove others: match via SCENE fill/stroke; never delete an artboard id (use `delete_frame`). Tool arg shapes → TOOL_DETAILS.
