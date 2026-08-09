# Ecommerce surfaces

Playbook for **电商主图 / product hero** and **商详 / PDP** — product first, modules clear, commerce facts honest.

Mature craft (marketplace hero standards + PDP module IA): subject weight, sparse badges, scannable specs — never fake social proof.

## Principles
1. **Product is the hero** — ≥40–60% visual weight on the subject; whitespace around.
2. **Modules have order** — hero → title/price → benefits → specs → story → CTA; do not scramble.
3. **Honesty** — never invent % off, reviews, sold counts, phones, or prices the user did not give.
4. **One accent** — CTA/price only; neutrals elsewhere.
5. **Platform-aware size** — honor 1:1 / 3:4 / tall PDP when asked.

## Pick surface
| Surface | Aspect / feel | Job |
|---------|---------------|-----|
| **Hero** | ~1:1 or platform size | Subject largest; sparse badges; no nav/forms |
| **PDP** | Tall scroll or multi-section board | hero → title/price → benefits → specs → rich text → CTA |

## Hero workflow
1. `create_frame` at target size (1:1, 800×800, 3:4, or user WxH).
2. Subject: user cutout (`attachmentIndex`) **or** `create_image` genPrompt of the product on a clean plate.
3. Keep ≥40–60% weight on product; calm plate (not festive poster chaos).
4. Badges (sale/new): ≤2, small, high contrast; never invent % off.
5. Optional short title — do not cover the product face.
6. Far check: product unmistakable in ~1s.

## PDP workflow
1. Frame (tall or sectioned frames if multi-screen).
2. Top: product hero (image) + title; price **only if user provided** (else omit or "—").
3. Benefits: 3–5 short lines or icon+text rows (constructive vector marks, not emoji).
4. Specs: aligned label/value pairs or simple table rhythm.
5. Rich text / story: calmer type; generous margins.
6. Sticky CTA bar optional — one primary verb from user copy.

## Ops mapping
| Need | Ops |
|------|-----|
| Product photo | `create_image` + attachmentIndex or genPrompt |
| Badge | Small filled shape + short label text |
| Price / CTA | High-contrast text/shape; one accent role |
| Spec rows | Paired `create_text` columns; aligned |
| Benefit icons | Simple shapes / svg — not emoji tofu |

## Platform size recipes
| Platform feel | Size cue |
|---------------|----------|
| Square hero | 1:1 (e.g. 800×800 / 1080×1080) |
| Portrait card | 3:4 |
| Tall PDP | 750× long scroll or stacked section frames |

## Edit
Preserve module order under `canvas_edit`. Prefer `update_node` / `move_nodes`; do not rebuild product hero as shape collage.

## Do not
- Bury the product under badges, stickers, or festive chrome
- Fake reviews, sold counts, coupons, or phones
- Five equal CTAs or rainbow accents
- Turn hero into a lifestyle poster that hides the SKU
- Invent pricing tiers or comparison tables

## Related
`image_gen` (product plate), `frontend_ui` / `shadcn_ui` (if embedding buy-box UI chrome), `ui_ux_pro_max` (contrast/overflow).

## Done when
Product is unmistakable at a glance; modules scannable; no invented commerce facts; copy language matches user; SCENE ids only.
