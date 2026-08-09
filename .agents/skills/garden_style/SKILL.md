# Garden style

Deliver canvas work that looks **intentional and memorable** — not a safe AI draft.

Mature craft (Anthropic frontend-design taste + canvas-design philosophy): name a direction, pick one memory point, execute with master-level craft — via tool_ops, not code.

## Principles
1. **Commit a direction** — minimal / editorial / industrial / organic / luxury / festive hand / playful geometric / retro-futurist — one only.
2. **One memory point** — hero image **or** hero title dominates; never both fighting.
3. **Atmosphere over flat fill** — backgrounds have depth (image, gradient, texture) matching the tone.
4. **Anti-slop** — refuse default AI faces unless the brief demands them.
5. **Craftsmanship** — alignments, contrast, and type mood must look labored-over.

## Workflow
1. Purpose: who sees this and what job it does.
2. Pick **one** tone from the catalog; justify one creative risk.
3. Lock constraints: size, required copy, whether image gen is allowed.
4. Choose the single memory point.
5. Build: frame → atmosphere/hero → hierarchy copy → sparse decoration.
6. Far/near self-check; fix higher failures first (`ui_ux_pro_max`).

## Direction catalog (pick one)
| Direction | Cues |
|-----------|------|
| Minimal | Few elements, precise gaps, quiet palette, one accent |
| Editorial | Strong display type, asymmetric crop, magazine margins |
| Industrial | Utility type, hard edges, restrained metal/ink palette |
| Organic | Soft forms, natural textures, muted earth/plant tones |
| Luxury | High contrast, generous empty, refined metals/ink |
| Festive hand | Illustrated hero + expressive lettering; shapes only as accents |
| Playful geometric | Bold primitives, flat color blocks, friendly type |
| Retro-futurist | Period cues + modern restraint; avoid costume-party clutter |

## Anti-defaults (unless brief demands)
Purple→indigo gradients on white; Inter/Roboto/Arial as “design”; warm cream `#F4F1EA` + terracotta serif cliché; dense broadsheet hairlines; glow stacks; rounded-full pill spam; emoji-as-icon; Space Grotesk convergence.

## Build rules
- Festive / illustration / atmosphere poster: `create_image`+genPrompt for the main visual; shape collage ≠ done.
- Type: distinctive display + restrained body; do not force generic UI sans onto illustration posters.
- Color: one dominant + sharp accent; copy must clear the background; prefer roles over scattered hex.
- Space: generous whitespace **or** controlled density — never “everything centered, nothing focal.”
- Background: atmosphere (gen image, gradient, texture); put copy on quieter regions.
- Decoration: only what serves the theme; ban generic play/smile/volume UI chrome as festive props.
- Motion (if allowed): 1–2 high-impact beats via **motion_lottie**, not jitter.

## Far / near check
- Far (~1s): theme + main title readable; hero is illustration/photo when required.
- Near: no clipped glyphs, low contrast, emoji tofu, or unrelated icons.
- Tone: type mood matches the picture.

## Do not
- Ship a “safe” generic template that could belong to any brand
- Mix two directions mid-board without declaring cover/merge
- Use festive Material icons as illustration substitutes
- Skip `create_frame` on fixed-size briefs

## Canvas
Fixed size → `create_frame` first, then content inside FOCUS. Node ids only from SCENE.

## Related
`poster_craft` / `landing_page` / `frontend_ui` for surface playbooks; `awesome_design_md` when a brand parameter sheet exists; `ui_ux_pro_max` as craft gate.

## Done when
Direction is nameable in one phrase; one memory point; anti-defaults cleared; far/near pass; SCENE ids only.
