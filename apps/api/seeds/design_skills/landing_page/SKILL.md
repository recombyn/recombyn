# Landing / website

Playbook for **落地页 / 官网 / landing** — one thesis, clear section rhythm, one primary CTA.

Mature craft (SaaS landing IA + Anthropic frontend-design differentiation): hero thesis, scannable benefits, honest proof — multi-section frames, not a festive mega-poster.

## Principles
1. **One thesis** — one headline job; supporting line clarifies; everything else serves it.
2. **One primary CTA** — secondary actions stay ghost/quiet.
3. **Section spine** — nav → hero → benefits → proof (optional) → CTA → footer.
4. **Honest proof** — logos/quotes only if user provided; never invent testimonials or pricing.
5. **Direction once** — minimal SaaS / editorial brand / product demo — one language end-to-end.

## Workflow
1. Size: desktop (e.g. 1440×900+ scroll) or mobile (390×844). Multi-screen → one `create_frame` per screen (cap ~8).
2. Commit direction; optionally load `frontend_ui` + `garden_style`.
3. Build section spine; dense chrome inside sections → also `shadcn_ui`.
4. Craft gate with `ui_ux_pro_max` before done.
5. Far check: thesis + CTA in ~1s; near: alignment and contrast.

## Hero thesis
- One headline + one supporting line + one primary CTA.
- Visual: product shot / atmosphere `create_image` **or** strong typographic hero — not both fighting.
- Avoid generic “big number + purple gradient accent” unless the brief is metric-led.

## Sections → ops
| Block | Canvas notes |
|-------|----------------|
| Nav | Logo mark + 3–6 text links; quiet surface |
| Hero | Image or display type + CTA button shape |
| Benefits | 3 equal cards/rows; shared radius; short titles |
| Proof | Logos/quotes **only if provided** |
| CTA band | High contrast; single verb from user copy |
| Footer | Muted; links + legal short |

## Desktop vs mobile
| | Desktop | Mobile |
|--|---------|--------|
| Frame | ~1440×900+ | ~390×844 |
| Nav | Horizontal links | Compact mark + fewer links or hamburger metaphor (label it) |
| Benefits | 3-column cards | Stacked rows |
| CTA | Inline + band | Full-width in thumb zone |

## Cross-skill load order
1. `landing_page` (this spine)
2. `frontend_ui` (direction/tokens) when taste matters
3. `shadcn_ui` when forms/buttons densify
4. `garden_style` / `ui_ux_pro_max` for direction + craft gate

## Do not
- Five CTAs of equal weight
- Invent pricing tables, logos, or testimonials
- Turn the whole page into a poster with no scannable sections
- Mix festive hand-lettering with dense admin tables casually
- Endless single mega-frame when multi-screen was asked

## Done when
Hero job is obvious in ~1s; sections align to one grid; primary CTA unmistakable; copy language matches user; SCENE ids only.
