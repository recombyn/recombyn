# Poster / roll-up

Playbook for **海报 / poster / 易拉宝 / roll-up** — atmosphere first, then readable info groups.

Mature craft (Polish poster energy + Swiss hierarchy + Anthropic canvas-design): name a visual philosophy, commit one focal image, treat type as sparse visual accent — executed with `create_image` + quiet-zone type, never shape collage.

## Principles
1. **Atmosphere carries meaning** — form, color, and space speak before paragraphs.
2. **One focal hero** — full/near-full `create_image`; shape piles are not posters.
3. **Quiet zones for type** — place copy on calm bands; never fight busy art with hard titles.
4. **Sparse text** — one primary line + ≤2 support clusters; type is accent, not essay.
5. **Master craftsmanship** — alignments and contrast must look labored-over, not AI-default.

## Workflow
1. Lock size (common: 1080×1920, 1242×2208, 800×2000 roll-up, 1920×1080 wide). `create_frame` first at WxH.
2. Name the tone in one phrase (festive hand / luxury ink / editorial photo / minimal print / brutalist block …).
3. Deduce the subtle subject from the brief — embed it visually; do not announce with paragraphs.
4. Build layer order below; pull `image_gen` + `garden_style` / `ui_ux_pro_max` when needed.
5. Far/near self-check; fix contrast and clip before declaring done.

## Layer order (required)
| Step | Ops |
|------|-----|
| 1. Hero | `create_image` + `genPrompt` full or near-full board |
| 2. Quiet zones | Darken/blur plate or place copy on calm regions (top/mid/bottom) |
| 3. Title | One primary line; catalog display if ~≥90% match else `create_image` + `letteringText` |
| 4. Support | Date / venue / CTA / bullets — clearly smaller; ≤2 clusters |
| 5. Accents | Thin shapes or small marks only; no Material icon spam; no emoji in `create_text` |

## Tall vs wide
| Format | Hierarchy |
|--------|-----------|
| Tall poster / roll-up | Top brand/title → mid hero focus → bottom info/CTA; side margins ≥ ~5% width |
| Wide banner-poster | Left/right subject vs copy; mid-band safe for title; avoid edge clip |

## genPrompt cues
Subject + style/medium + lighting + composition + color + negatives (no extra gibberish text/logo/watermark unless `letteringText`). Aim for meticulously crafted atmosphere, not stock-template vibes.

## Type scale (feel)
| Role | Relative |
|------|----------|
| Title | Dominates; one line preferred |
| Support | Clearly smaller; secondary weight |
| Meta | Smallest; date/venue/legal |

## Edit
Prefer `update_node` / `move_nodes` on type and accents. Do **not** rebuild the hero as shapes. Regenerate hero image only when the brief's atmosphere changes.

## Do not
- Fake hero with rect/circle piles
- Five equal-weight slogans
- Hard title against the edge / low-contrast type on busy art
- Invent QR / phone / price / logos
- Festive Material UI chrome as decoration
- Treat the poster like a dense admin document

## Related
`image_gen` (hero), `garden_style` (direction), `ui_ux_pro_max` (craft gate), `brush_ops` (hand accents only).

## Done when
Far: theme + title read in ~1s. Near: no clip, contrast OK, one focal image, copy language matches user; SCENE ids only.
