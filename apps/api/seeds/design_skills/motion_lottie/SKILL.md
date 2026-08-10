# Motion / Lottie

Playbook for **Lottie / 动效 / UI motion** — calm, purposeful loops and one-shots. Tool args live in TOOL_DETAILS.

## Principles
1. **Motion has a job** — loading, success, empty idle, like/favorite — not decoration for its own sake.
2. **1–2 focal movers** — extra limbs and flicker read as noise.
3. **Calm loops** — prefer ease and settle over seizure-level flash.
4. **Style matches chrome** — flat UI / line / soft 3D must agree with surrounding UI tokens.
5. **Static marks stay vector** — icons that do not move stay shapes/SVG, not Lottie.

## Workflow
1. Confirm the brief needs motion (explicit Lottie/动效/loading loop) — else skip.
2. Place inside FOCUS; size for tap-adjacent UI (≥ ~44px feel when interactive-adjacent).
3. Write a tight motion prompt: what moves, loop vs one-shot, tempo, style, colors, purpose.
4. Use the Lottie tool with that prompt — never invent huge animation JSON unless the user pasted Bodymovin.
5. Self-check: purpose clear in ~1s; no flicker; colors match UI.
6. Refine size/position in place when only layout changed.

## Prompt cues
Say explicitly: **what moves**, **loop vs one-shot**, **tempo**, **style**, **colors**, **purpose**.

## Recipes
| Intent | Lean |
|--------|------|
| Loading | Cyclic spinner/bar/dots; muted; infinite calm loop |
| Success | Short check / burst then settle; often non-loop |
| Empty state | Gentle idle; spacious; low amplitude |
| Like / favorite | Heartbeat or pop scale; accent color; short delight |
| Onboarding tip | Soft pulse on one affordance; do not animate whole screen |

## When NOT Lottie
| Need | Prefer |
|------|--------|
| Static icon / logo mark | Vector shapes / SVG / still image |
| Full-board festive poster | `poster_craft` + `image_gen` |
| Page transition metaphor only | Skip motion unless asked |

## Do not
- Seizure-level flicker or rainbow strobe
- Animate every chrome element “because we can”
- Use Lottie as a substitute for missing static icons
- Invent brand mascots or logos inside the motion
- Oversized motion covering primary copy

## Done when
Purpose reads in ~1s; 1–2 movers; loop/one-shot matches intent; colors agree with UI; tap-safe size when UI-adjacent.
