# UI / UX craft gate

Quality bar for canvas deliverables — readability, hierarchy, overflow, and hero vs shape choices.

Mature craft (WCAG contrast habits + production design QA + Anthropic “fix higher failures first”): run the gate before declaring done.

## Principles
1. **Higher failures first** — hero/contrast/overflow beat decoration polish.
2. **One language** — festive hand / minimal UI / editorial … end-to-end.
3. **Readable always** — body contrast and no clipped glyphs are non-negotiable.
4. **Hero honesty** — festive/illustrated briefs need real `create_image`, not shape piles.
5. **UI affordances** — labels, hit targets, and errors must be visible without hover.

## Workflow
1. Name deliverable (SaaS UI, landing, ecommerce, banner, poster/rollup, icon …).
2. Apply checklist **high → low**; fix higher failures first.
3. Confirm one style language end-to-end.
4. Place into FOCUS frame; SCENE ids only.
5. Tick pre-paint checklist, then emit or finalize ops.

## Priority checklist
1. **Poster / festive hero**: `create_image`+genPrompt first (full/near-full). Do not fake with shape piles.
2. **Contrast**: body ≥ ~4.5:1; large titles ≥ ~3:1; no near-hue on near-hue.
3. **Overflow**: every `create_text` glyph inside the board; side margins (vertical posters ≥ ~5% width); shrink/wrap — never clip.
4. **Hierarchy**: one primary title; supporting clearly smaller; avoid 5+ equal slogans.
5. **Consistency**: one language (festive hand / minimal UI / editorial …).
6. **Type**: UI/info → `create_text`+Available fonts; festive display fonts cannot match → `create_image`+letteringText.
7. **Decoration**: no Material/generic UI icons as festive props; no emoji inside `create_text`; shapes are accents, not the hero.
8. **Hit targets** (UI): large enough; do not rely on hover alone.
9. **Forms**: visible labels; errors adjacent to fields.

## Spacing / rhythm
Pick a base step (4 or 8) and stick to it for gaps, padding, and type scale jumps. Align columns; avoid 1–2px “almost” misalignment.

## Deliverable hints
| Deliverable | Lean toward | Also |
|-------------|-------------|------|
| SaaS / admin | Clear hierarchy, restrained color, scannable tables/forms | `dashboard_ui` |
| Landing / brand | Hero thesis + CTA; whitespace or controlled density | `landing_page` |
| Ecommerce hero | Subject largest; sparse badges | `ecommerce_surface` |
| Banner | Mid-band copy; strong contrast; quiet sides | `poster_craft` cues |
| Poster / rollup | Generated hero + top/mid/bottom copy; quiet zone for title | `poster_craft` |
| Mobile screen | Single column; thumb-zone primary CTA | `mobile_app_ui` |
| Resume / CV | Document scan path; no festive chrome | `resume_layout` |

## Pre-paint checklist
- [ ] Hero image exists when the brief needs one
- [ ] Title fully visible, not hard against the edge
- [ ] Copy clears the background
- [ ] One focal point + ≤2 support lines
- [ ] No stray SVG / emoji tofu
- [ ] Base spacing step consistent
- [ ] Primary action obvious (UI) or thesis obvious (marketing)

## Do not
- Polish shadows while text is clipped
- Pass a festive brief with only geometric decoration
- Treat this gate as a substitute for surface playbooks

## Done when
All high-priority checks pass; remaining issues are minor polish only; SCENE ids only.
