# Image generation

Craft for **visual plates on the board**: bitmaps, vectors, and type. Choose medium by **what draws well**, not by a fixed “vectors are only accents” rule.

## Design thinking

| Ask | Aim |
|-----|-----|
| **What carries the eye** | Atmosphere, subject, or display type — pick the memory point |
| **Tone** | One direction matching the brief |
| **Bitmap vs vector** | **Simple** marks/geometry that stay crisp → vector. **Complex** scenes, lighting, materials, faces, busy illustration → bitmap (`add image`). If a vector attempt would look like crude shape spam, switch to image |
| **Where type sits** | Quiet bands so overlay copy reads |
| **Medium (bitmap)** | Photo, illustration, grain print, soft 3D, etc. — one craft language per plate |

Quality bar: **intentional design** — light, material, and crop that fit this brief. Soft-avoid generic AI postcard defaults. This is designed specificity, not a “handmade” texture effect.

## When to use bitmap

- Atmosphere / mood that needs depth, haze, rich light, or material.
- Products, people, props with believable form and light.
- Complex illustrated heroes that vectors cannot carry cleanly.
- Lettering art when catalog fonts cannot match the gesture (~90%+).

Prompt with subject, medium, lighting, composition, color, and avoid-in-image (e.g. baked titles, watermarks — unless the user wants text in the picture).

## When to use vector

- Simple geometry done cleanly: rules, frames, dots, discs, bars, flat badges, icons, clean silhouettes.
- UI marks and glyphs (`icon_set` when many).
- Structural color blocks and dividers that support hierarchy.

Shared stroke / corner / ink with the board. Soft-avoid emoji as marks.

**Not a ban on simple scenes in vector** — a flat night field + moon disc + a few stars can be vector if that is the intentional, simple language. Prefer bitmap when the brief wants rich atmosphere or the vector version would look unfinished.

## Subject & product plates

- Clear silhouette and believable light when using bitmap.
- Studio / clean plate when the product should stay honest; lifestyle only when asked.
- **Cutout** when a solid plate sits on a colored board (avoid leftover white boxes).

## Lettering

- Catalog **add text** when a face is a close match (~90%+).
- Lettering **as image + cutout** when display / calligraphy / neon / 国潮 needs a gesture fonts cannot carry.
- Body and captions stay catalog text.

## Honesty

Unless the user asks for them, avoid inventing facts inside the picture such as logos, prices, phone numbers, etc.

## Place on board

| Action | Use |
|--------|-----|
| **Add image** | Bitmap plate |
| **Add text** | Editable catalog type |
| **Cutout** | Drop solid plate on subjects / lettering (skip on full-bleed backgrounds) |
| **Vector shapes / marks** | Simple geometry, rules, icons, clean accents |

Typical stack: background (bitmap **or** simple vector field) → subject → structure/marks → title → support.

## Related

`poster_craft`, `banner_ad`, `long_scroll`, `ecommerce_surface`, `landing_page`, `icon_set`, `garden_style`

## Done when

Far: tone and focal read in ~1s. Near: medium choice fits complexity; type sits on quiet ground; language matches the user.
