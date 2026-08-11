# Dashboard / admin UI

Craft for **后台 / dashboard / console** — scannable density, clear IA, honest empty states. Most chrome is simple vector; complex media widgets use image when needed.

## Design thinking

| Ask | Aim |
|-----|-----|
| **Job** | What scans in ~2s — nav + KPIs + main? |
| **IA** | Filters+table / KPI+chart+table / master-detail / cards — pick one primary |
| **Tone** | Dense but calm; one token system |
| **Bitmap vs vector** | Simple shell, KPI cards, charts, marks → vector. Complex media / photo widgets → bitmap. If vectors look crude, use image |
| **Data honesty** | Metrics from the user, or placeholders like `—` |
| **Device** | Desktop ~1440×900; phone → prefer `mobile_app_ui` |

Quality bar: **intentional design** — alignment and roles crisp. Soft-avoid festive poster heroes and invented analytics.

## Shell & composition

| Region | Compose |
|--------|---------|
| Sidebar | Mark + nav; active = weight and color |
| Top bar | Title / search / user — quiet |
| KPI row | 3–4 equal cards; aligned baselines |
| Main | Table **or** card grid as primary |
| Filters | Labeled controls; one primary Apply when needed |

States: loading skeleton / empty + one action / error + next step.

## Type

Muted labels, bold values; one console type system. Primary button verb from user language.

## Vector vs image

Nav and KPI marks as real geometry when simple (`icon_set` when many). Charts as simple bar/line structure. Dense controls → `shadcn_ui`. Soft-avoid emoji as icons. Soft-avoid rebuilding the whole console as a marketing collage.

## Honesty

Unless the user provides them, avoid inventing board facts such as KPI numbers, chart series, logos, revenue samples, etc. Prefer `—` or empty structure.

## Place on board

Shell → KPI → main → filters. Load `image_gen` only when a media widget needs a real bitmap.

## Related

`shadcn_ui`, `icon_set`, `mobile_app_ui`, `image_gen` (media widgets)

## Done when

Nav + KPIs + main scan quickly; roles consistent; medium matches complexity; language matches the user.
