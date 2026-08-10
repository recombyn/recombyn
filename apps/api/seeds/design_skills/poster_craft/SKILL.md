# Poster / roll-up

Playbook for **海报 / poster / 易拉宝 / roll-up** — atmosphere first, then readable info groups.

Mature craft: name a visual philosophy, commit one focal image, treat type as sparse visual accent — never a shape collage pretending to be a poster.

## Principles
1. **Atmosphere carries meaning** — form, color, and space speak before paragraphs.
2. **One focal hero** — full/near-full board atmosphere or photo; geometry piles are not posters.
3. **Quiet zones for type** — place copy on calm bands; never fight busy art with hard titles.
4. **Sparse text** — one primary line + ≤2 support clusters; type is accent, not essay.
5. **Master craftsmanship** — alignments and contrast must look labored-over, not AI-default.

## Workflow
1. Lock size (common: 1080×1920, 1242×2208, 800×2000 roll-up, 1920×1080 wide).
2. Name the tone in one phrase (festive hand / luxury ink / editorial photo / minimal print …).
3. Deduce the subject from the brief — embed it visually; do not announce with paragraphs.
4. Build layer order below; pull `image_gen` + `garden_style` when needed.
5. Far/near self-check; fix contrast and clip before declaring done.

## Layer order
1. **Hero** — full or near-full board scene/atmosphere only (no baked titles).
2. **Quiet zones** — calm bands for copy (top/mid/bottom).
3. **Title** — one primary editable line (or lettering art when catalog fonts fail the 90% gate).
4. **Support** — date / venue / CTA / bullets — clearly smaller; ≤2 clusters.
5. **Accents** — thin marks only; no Material icon spam; no emoji as type.

## Tall vs wide
| Format | Hierarchy |
|--------|-----------|
| Tall poster / roll-up | Top brand/title → mid hero focus → bottom info/CTA; side margins ≥ ~5% width |
| Wide banner-poster | Left/right subject vs copy; mid-band safe for title; avoid edge clip |

## Image intent
Subject + style/medium + lighting + composition + color + **hard negatives**:
- No titles, event names, dates, venue text, logos, watermarks, or gibberish letters in the hero bitmap.
- Titles/dates live as editable type on quiet zones.
- Cutout subjects on a colored board: solid plate + cutout — never leave a white rectangle.

## Type scale (feel)
| Role | Relative |
|------|----------|
| Title | Dominates; one line preferred |
| Support | Clearly smaller; secondary weight |
| Meta | Smallest; date/venue/legal |

## Edit
Refine type and accents in place. Do **not** rebuild the hero as shapes. Regenerate hero only when the brief's atmosphere changes.

## Do not
- Fake hero with rect/circle piles
- Five equal-weight slogans
- Hard title against the edge / low-contrast type on busy art
- Bake the poster title/date into the hero then overlay the same copy again
- Invent QR / phone / price / logos
- Festive Material UI chrome as decoration
- Composite subjects with leftover white cutout boxes

## Related
`image_gen` (hero), `garden_style` (direction), `brush_ops` (hand accents only).

## Done when
Far: theme + title read in ~1s. Near: no clip, contrast OK, one focal image, copy language matches user.

## Review gate (for Review Agent / SKILL_CRAFT)
Fail (`must_fix`) when any of:
- Hero is a shape/geometry pile instead of `create_image` atmosphere
- Hero bitmap bakes titles/dates that also appear as overlay type
- Product/subject plates leave white cutout boxes on a colored board
- Title clipped, low-contrast on busy art, or five equal-weight slogans
Pass when Principles + Done-when above hold and DESIGN_BRIEF image strategy is met.
