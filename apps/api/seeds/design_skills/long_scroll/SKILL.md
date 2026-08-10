# Long image / scroll story

Playbook for **长图 / long image / 长截图 / scroll story** — one tall continuous board.

## Principles
1. **One board, tall rhythm** — single tall artboard (e.g. 750×3000+ or 1080×4000); not many separate boards unless user asks.
2. **Chapter beats** — intro → 3–6 sections → close/CTA; each beat needs a visual pause.
3. **Mobile-first width** — keep ~750–1080 width; generous vertical spacing between chapters.
4. **Sticky thesis** — repeat the core claim lightly; do not dump all copy at the top.

## Workflow
1. Lock WxH; prefer width 750/1080; height from content (start ≥2800 if story-rich).
2. Map chapter list before painting (title each beat in one phrase).
3. Per chapter: optional mood band + quiet type block; pull `image_gen` sparingly (1 hero + accents).
4. Keep left/right margins ≥ ~6% width; avoid edge-clipped titles.
5. Closing beat: one CTA or takeaway — not a second landing page.
6. Self-check: scroll continuity, contrast on each band, no invented metrics.

## Rhythm
| Zone | Role |
|------|------|
| Hook (top ~15%) | Hook visual + one-line thesis |
| Body chapters | Alternating image/type density; clear separators |
| Close | Summary + CTA / share prompt |

## Avoid
- Short 1:1 poster when user asked 长图
- Website nav + footer chrome on a shareable long image
- Wall of text without visual pauses

## Review gate (for Review Agent / SKILL_CRAFT)
Fail (`must_fix`) when a tall board (≥~1400px or aspect ≳2.2) leaves large empty bottom — content coverage should reach ~≥72% of height; APPEND modules below current content (no clear/rebuild top).
Pass when chapter rhythm + coverage meet Principles above.
