# Image generation

Craft for **bitmap heroes / materials / lettering art** — concrete prompts, honest typography gate, cutout when compositing. Tool args live in TOOL_DETAILS; this skill owns *what to ask for*, not op recipes.

## Principles
1. **Hero honesty** — festive/illustrated boards start with a real full/near-full bitmap, not shape piles.
2. **Typography gate (~90%)** — catalog face or lettering image; never invent font names.
3. **Concrete prompts** — subject, medium, light, composition, color, negatives.
4. **Stacking** — image first, then type/chrome on quieter regions.
5. **No invented facts** inside the picture (logos, prices, phones) unless asked / letteringText.
6. **Cutout when compositing** — product / subject plates on a design bg must be transparent (no white box).

## When
- Poster / festive / illustrated hero
- Photo / product / material / atmosphere backgrounds
- Display lettering that fails the typography gate below

## Two image jobs (do not mix)
| Job | Prompt must | Finish |
|-----|-------------|--------|
| **Atmosphere / full-bleed hero** | Scene only — **no titles, dates, slogans, logos, watermarks, gibberish letters**. Titles come later as editable type / letteringText. | no cutout |
| **Product / subject plate** | Isolated subject on **plain solid plate** (white/neutral); studio light; no lifestyle collage text | cutout / removeBg |
| **Lettering art** | Glyphs only on plain plate | letteringText + cutout |

## Typography gate (~90%)
Compare needed title look to Available fonts:
- ~**≥90%** similar → catalog editable type
- Below — especially hero/main titles → lettering image on a plain plate (hydrate cutout). Do **not** map 书法感/手写感/国潮/艺术字 to the nearest calligraphy font.
- Body/UI/captions: prefer catalog faces; invent no font names.
If the user forbids image gen: skip bitmaps; plain editable type only.

## Prompt recipe
Include: **subject**, **style/medium**, **lighting/mood**, **composition/camera**, **color cues**, **negatives**.
- Atmosphere negatives: **no text, no letters, no logo, no watermark, no poster title baked in**.
- Product plate: **isolated on solid white/neutral background** + cutout.
- Lettering: isolate glyphs; high contrast plate; no busy background behind letters.

## Stacking
Hero image first → then type / UI chrome on quieter regions. Size/transparency details → TOOL_DETAILS.

## Route
| Brief | Also load |
|-------|-----------|
| Poster / roll-up | `poster_craft` |
| Ecommerce product plate | `ecommerce_surface` |
| Taste / anti-slop | `garden_style` |

## Do not
- Fake festive heroes with geometry
- Bake event titles / dates / CTAs into the hero when editable type will sit on top
- Ship product photos with a white rectangle still visible on a colored board
- Paste finished composites that double-print baked titles

## Done when
Hero/atmosphere exists when required; lettering path respects the 90% gate; product plates are cut out; prompt is concrete; stacking leaves quiet zones for type.

## Review gate (for Review Agent / SKILL_CRAFT)
Fail when: festive/illustrated board has no real bitmap hero; product plate still shows a white box; atmosphere genPrompt baked titles that fight overlay type; typography gate ignored for hero lettering.
Pass when Principles + Done-when hold for the brief's image job.
