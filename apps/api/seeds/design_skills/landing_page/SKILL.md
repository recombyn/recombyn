# Landing / website

Craft for **落地页 / 官网 / landing** — one thesis, section rhythm, one primary CTA.

## Design thinking

| Ask | Aim |
|-----|-----|
| **Purpose** | Conversion or story job |
| **Tone** | One aesthetic — editorial, minimal, industrial, soft product, etc. |
| **Thesis** | One headline + one supporting line |
| **CTA** | One primary action; secondaries stay quiet |
| **Bitmap vs vector** | Simple cards / icons / rules / chrome → vector. Rich hero atmosphere/product → bitmap. If vectors look crude, use image |
| **Proof** | Only assets the user gave |
| **Device** | Desktop ~1440 or mobile ~390 |

Quality bar: **intentional design** — clear IA and one memory point. Soft-avoid generic AI postcard heroes and five equal CTAs.

## Sections & composition

| Block | Notes |
|-------|-------|
| Nav | Mark + few links |
| Hero | Image or display type + primary CTA |
| Benefits | 3 equal units; short titles |
| Proof | User-provided logos/quotes |
| CTA band | Single verb from user copy |
| Footer | Muted links |

| | Desktop | Mobile |
|--|---------|--------|
| Board | ~1440×900+ | ~390×844 |
| Benefits | 3 columns | Stacked |
| CTA | Inline + band | Full-width thumb zone |

## Type

One type system page-wide. Headline owns the thesis; body stays quieter.

## Vector vs image

Card frames, dividers, benefit marks → vector. Complex hero scenes → `image_gen`. Soft-avoid emoji as icons (`icon_set` when many). Dense controls → `shadcn_ui`.

## Honesty

Unless the user provides them, avoid inventing board facts such as logos, testimonials, pricing tables, phone numbers, etc.

## Place on board

When the hero needs bitmaps or cutouts, load **`image_gen`**.

Typical stack: hero bitmap → vector section chrome → type → CTA.

## Related

`image_gen`, `shadcn_ui`, `icon_set`, `garden_style`

## Done when

Hero job is obvious quickly; sections share one grid; primary CTA clear; language matches the user.
