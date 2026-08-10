# Landing / website

Playbook for **落地页 / 官网 / landing** — one thesis, clear section rhythm, one primary CTA.

## Principles
1. **One thesis** — one headline job; supporting line clarifies; everything else serves it.
2. **One primary CTA** — secondary actions stay ghost/quiet.
3. **Section spine** — nav → hero → benefits → proof (optional) → CTA → footer.
4. **Honest proof** — logos/quotes only if user provided; never invent testimonials or pricing.
5. **Direction once** — minimal SaaS / editorial brand / product demo — one language end-to-end.

## Workflow
1. Size: desktop (e.g. 1440×900+ scroll) or mobile (390×844). Multi-screen → one artboard per screen (cap ~8).
2. Commit direction; optionally load `garden_style`.
3. Build section spine; dense chrome inside sections → also `shadcn_ui`.
4. Self-check contrast, overflow, and hierarchy before done.
5. Far check: thesis + CTA in ~1s; near: alignment and contrast.

## Hero thesis
- One headline + one supporting line + one primary CTA.
- Visual: product shot / atmosphere image **or** strong typographic hero — not both fighting.
- Avoid generic “big number + purple gradient accent” unless the brief is metric-led.

## Sections
| Block | Notes |
|-------|-------|
| Nav | Logo mark + 3–6 links; quiet surface |
| Hero | Image or display type + CTA |
| Benefits | 3 equal cards/rows; shared radius; short titles |
| Proof | Logos/quotes **only if provided** |
| CTA band | High contrast; single verb from user copy |
| Footer | Muted; links + legal short |

## Desktop vs mobile
| | Desktop | Mobile |
|--|---------|--------|
| Board | ~1440×900+ | ~390×844 |
| Nav | Horizontal links | Compact mark + fewer links |
| Benefits | 3-column cards | Stacked rows |
| CTA | Inline + band | Full-width in thumb zone |

## Cross-skill load order
1. `landing_page` (this spine)
2. `shadcn_ui` when forms/buttons densify
3. `garden_style` when a strong art direction is needed

## Do not
- Five CTAs of equal weight
- Invent pricing tables, logos, or testimonials
- Turn the whole page into a poster with no scannable sections
- Mix festive hand-lettering with dense admin tables casually

## Done when
Hero job is obvious in ~1s; sections align to one grid; primary CTA unmistakable; copy language matches user.
