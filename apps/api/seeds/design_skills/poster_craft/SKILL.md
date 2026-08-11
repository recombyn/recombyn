# Poster / roll-up

Craft for **海报 / poster / 易拉宝 / roll-up / 演唱会 KV** — atmosphere and hierarchy first; sparse, intentional type. Medium follows complexity: simple → vector OK; complex → image.

## Design thinking

| Ask | Aim |
|-----|-----|
| **Purpose** | Who sees it, and what sticks in ~1s? |
| **Tone** | One direction — e.g. night quiet, editorial, luxury, industrial, organic, retro-futurist |
| **Memory point** | Strong atmosphere **or** dominant title — not both fighting |
| **Bitmap vs vector** | Simple geometry / flat language → vector. Rich light, material, photo, busy illustration → bitmap via `image_gen`. If vectors would look crude, use image |
| **Copy budget** | Usually 1 title + ≤2 support clusters |
| **Constraints** | Size / roll-up / language / user assets |

Quality bar: **intentional design** — hierarchy and crop fit this brief. Soft-avoid generic AI postcard defaults.

## Atmosphere & layout

- Tall / roll-up: top brand/title → mid focus → bottom info/CTA; generous side margins.
- Wide: subject vs copy left/right; mid-band safer for title.
- Quiet bands for type on busy grounds.
- Visual-first posters need a real scene when complexity calls for it — not a pile of random shapes pretending to be atmosphere.

## Type & hierarchy

- Title ≫ support ≫ meta.
- Catalog text when fonts match (~90%+); lettering image + cutout when display needs it (`image_gen`).
- Language matches the user.

## Vector vs image (same rule)

| Prefer vector when | Prefer bitmap when |
|--------------------|--------------------|
| Clean discs, dots, bars, frames, hairlines, flat badges | Deep night sky with rich light/haze/material |
| Simple geometric poster language, intentional and sparse | Photo / painted hero, complex illustration |
| Icons and crisp marks | Faces, products, detailed props |

## Honesty

Unless the user provides them, avoid inventing board facts such as logos, prices, phone numbers, QR codes, review counts, etc.

## Place on board

Load **`image_gen`** when placing bitmaps, cutouts, or lettering plates.

Typical stack: background → optional subject → simple vector structure → title → support.

Second pass: refine alignment and contrast before adding more marks.

## Related

`image_gen`, `garden_style`, `brush_ops` (accents only), `icon_set`

## Done when

Far: tone + title in ~1s. Near: medium matches complexity; type clear; language matches the user.
