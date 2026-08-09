# Motion / Lottie

Playbook for **Lottie / 动效 / UI motion** — calm, purposeful loops and one-shots for loading, success, empty, and micro-delight.

Mature craft (Apple HIG motion + Material motion + Lottie practice): one focal mover, readable tempo, reduced-motion friendly loops — via `create_lottie`, never hand-authored mega JSON.

## Principles
1. **Motion has a job** — loading feedback, success confirm, empty idle, like/favorite delight — not decoration for its own sake.
2. **1–2 focal movers** — extra limbs and flicker read as noise (and fail a11y).
3. **Calm loops** — prefer ease and settle over seizure-level flash.
4. **Style matches chrome** — flat UI / line / soft 3D must agree with surrounding UI tokens.
5. **Static marks stay vector** — icons that do not move use `create_shape` / `create_svg`, not Lottie.

## Workflow
1. Confirm the brief needs motion (explicit Lottie/动效/loading loop) — else skip.
2. Place inside FOCUS; size for tap-adjacent UI (≥ ~44px feel when interactive-adjacent).
3. Write a tight `genPrompt`: what moves, loop vs one-shot, tempo, style, colors, purpose.
4. Emit `create_lottie` with `genPrompt` — NEVER invent huge `animationData` unless the user pasted Bodymovin JSON.
5. Self-check: purpose clear in ~1s; no flicker; colors match UI.
6. Refine via `update_node` or replace with a new `create_lottie`.

## Ops (required)
| Rule | Detail |
|------|--------|
| MUST | `create_lottie` + `genPrompt` (brief motion + style) |
| NEVER | Substitute `create_image` / `create_svg` / shape piles for requested motion |
| NEVER | Hand-author giant `animationData` unless user pasted JSON |
| Place | x/y/w/h inside FOCUS; keep SCENE ids |

## genPrompt cues
Say explicitly: **what moves**, **loop vs one-shot**, **tempo**, **style** (flat UI / line / soft 3D), **colors**, **purpose** (loading / success / empty / like).

## Recipes
| Intent | Lean |
|--------|------|
| Loading | Cyclic spinner/bar/dots; muted chrome; infinite calm loop |
| Success | Short check / burst then settle; often non-loop |
| Empty state | Gentle idle (float/blink); spacious; low amplitude |
| Like / favorite | Heartbeat or pop scale; accent color; short delight |
| Onboarding tip | Soft pulse on one affordance; do not animate whole screen |

## When NOT Lottie
| Need | Prefer |
|------|--------|
| Static icon / logo mark | `create_shape` / `create_svg` / `create_image` |
| Full-board festive poster | `poster_craft` + `image_gen` |
| Page transition metaphor only | Skip motion unless asked |

## Do not
- Seizure-level flicker or rainbow strobe
- Animate every chrome element “because we can”
- Use Lottie as a substitute for missing static icons
- Invent brand mascots or logos inside the motion
- Ignore FOCUS / oversized motion covering primary copy

## Edit
Replace/refine via `create_lottie` or `update_node`; keep SCENE ids. Prefer updating size/position over regenerating when only layout changed.

Args detail: TOOL_DETAILS for `create_lottie`.

## Done when
Purpose reads in ~1s; 1–2 movers; loop/one-shot matches intent; colors agree with UI; tap-safe size when UI-adjacent; SCENE ids only.
