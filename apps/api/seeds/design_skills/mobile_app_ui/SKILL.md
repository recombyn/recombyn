# Mobile / H5 app UI

Playbook for **手机 / H5 / App** screens — single column, thumb-first, honest chrome.

## Principles
1. **Thumb-first** — primary CTA lives in the lower third; avoid corner-only primaries.
2. **Single column** — stack; do not port desktop sidebars as the default.
3. **Honest chrome** — do not invent OS battery/wifi glyphs unless asked.
4. **Hit targets** — generous tap height; do not rely on hover.
5. **Shared tokens across screens** — multi-board flows keep one type/color language.
6. **Real nav / list icons** — tabs, lists, and action marks are drawn vector glyphs (shared stroke). Never use emoji or a single pictograph character as an icon — including greetings and card titles.

## Workflow
1. Phone-ish size (e.g. 390×844) or user WxH. Multi-screen → one artboard per screen (cap ~8).
2. Pair with `shadcn_ui` for controls when needed; pair with `icon_set` when many glyphs share one stroke system.
3. Build: top bar → content → bottom nav **or** sticky CTA. Each bottom-nav item = vector mark + short plain label.
4. Apply safe insets; check tap sizes.
5. Far check at phone scale; near check overflow and contrast.

## Marks & labels
| Role | Craft |
|------|-------|
| Tab / list / KPI mark | One compact vector glyph per mark — not emoji, not a letter pretending to be an icon |
| Label | Short plain words only under/beside the mark |
| Bottom nav | Mark first, then label; 3–5 items max |

Keep the screen lean: do not explode each icon into many overlapping shapes; leave room for chrome and content.

## Safe area & insets
| Region | Cue |
|--------|-----|
| Side inset | ~16–24px content padding |
| Top | Title/logo; optional back; respect status-band calm |
| Bottom | Nav or sticky CTA above home-indicator feel |
| Tap height | List rows / buttons feel ≥ ~44px |

## Chrome
| Region | Notes |
|--------|-------|
| Top | Title or logo; optional back; quiet |
| Content | Single column; shared radius on cards/lists |
| Bottom nav | 3–5 items max; active = weight **and** color |
| Sticky CTA | Full-width primary in thumb zone; one verb |

## Patterns
| Pattern | Compose |
|---------|---------|
| Login / form | Labels above fields; error adjacent; full-width primary |
| Feed / list | Repeated rows; avatar + title + meta; generous height |
| Detail | Optional top image + title + body + bottom CTA |
| Empty | Short line + one action |
| Tabs | Labels; active underline; panel below |

## Multi-screen flows
- One artboard per step; reuse tokens.
- Carry the same primary verb language across steps.
- Do not invent intermediate marketing interstitial screens.

## When NOT this skill
| Need | Prefer |
|------|--------|
| Desktop admin density | `dashboard_ui` |
| Marketing multi-section site | `landing_page` |
| Festive full-board poster | `poster_craft` |

## Do not
- Desktop sidebar + dense tables as the default mobile layout
- Tiny tap targets; CTA only in the top corner
- Festive poster decoration on product chrome
- Five bottom-nav items of equal “primary” weight
- Emoji / pictograph text in greetings, cards, or nav (use vector marks + plain labels)

## Related
`shadcn_ui` for controls when needed; `icon_set` for glyph systems; `motion_lottie` only for explicit micro-motion.

## Done when
Readable at phone scale; primary action easy to reach; safe margins; hierarchy clear; tokens consistent across screens; every tab/list mark is a real vector glyph.
