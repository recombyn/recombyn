# Mobile / H5 app UI

Playbook for **手机 / H5 / App** screens — single column, thumb-first, honest chrome.

Mature craft (iOS HIG + Material compact + mobile web): safe areas, large hit targets, one primary in the thumb zone.

## Principles
1. **Thumb-first** — primary CTA lives in the lower third; avoid corner-only primaries.
2. **Single column** — stack; do not port desktop sidebars as the default.
3. **Honest chrome** — do not invent OS battery/wifi glyphs unless asked.
4. **Hit targets** — generous tap height; do not rely on hover.
5. **Shared tokens across screens** — multi-frame flows keep one type/color language.

## Workflow
1. Frame: phone-ish (e.g. 390×844) or user WxH. Multi-screen → one `create_frame` per screen (login / home / profile …), cap ~8.
2. Pair with `frontend_ui` for direction/tokens; `shadcn_ui` for controls.
3. Build: top bar → content → bottom nav **or** sticky CTA.
4. Apply safe insets; check tap sizes.
5. Far check at phone scale; near check overflow and contrast.

## Safe area & insets
| Region | Cue |
|--------|-----|
| Side inset | ~16–24px content padding |
| Top | Title/logo; optional back; respect status-band calm |
| Bottom | Nav or sticky CTA above home-indicator feel |
| Tap height | List rows / buttons feel ≥ ~44px |

## Chrome → ops
| Region | Notes |
|--------|-------|
| Top | Title or logo; optional back text/shape; quiet |
| Content | Single column; shared radius on cards/lists |
| Bottom nav | 3–5 items max; active = weight **and** color; large targets |
| Sticky CTA | Full-width primary in thumb zone; one verb |

## Patterns → ops
| Pattern | Compose |
|---------|---------|
| Login / form | Labels above fields; error text adjacent; full-width primary |
| Feed / list | Repeated rows; avatar shape + title + meta; generous height |
| Detail | Optional top image + title + body + bottom CTA |
| Empty | Short line + one action button |
| Tabs | Top or segmented labels; active underline/bar; panel below |

## Multi-screen flows
- One frame per step; reuse tokens (radius, primary, type roles).
- Carry the same primary verb language across steps.
- Do not invent intermediate marketing interstitial screens.

## When NOT this skill
| Need | Prefer |
|------|--------|
| Desktop admin density | `dashboard_ui` |
| Marketing multi-section site | `landing_page` |
| Festive full-board poster | `poster_craft` |

## Do not
- Desktop sidebar + dense data tables as the default mobile layout
- Tiny tap targets; CTA only in the top corner
- Festive poster decoration on product chrome
- Five bottom-nav items of equal “primary” weight
- Invent OS status icon clutter

## Related
`frontend_ui`, `shadcn_ui`; `motion_lottie` only for explicit micro-motion.

## Done when
Readable at phone scale; primary action easy to reach; safe margins; hierarchy clear; tokens consistent across screens; SCENE ids only.
