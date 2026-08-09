# Resume / CV

Playbook for **简历 / resume / CV** — scannable professional document, not a festive poster.

Mature craft (recruiter scan path + ATS-friendly clarity + Swiss document hierarchy): honest facts, clear columns, restrained type — via frames, text, and hairlines.

## Principles
1. **Scan path first** — name → contact → latest role → skills in seconds.
2. **Honesty** — never invent employers, dates, GPAs, phones, or titles; ask or leave gaps.
3. **Document, not poster** — no festive heroes, emoji icons, or illustration chrome.
4. **One grid** — ≤2 columns; align edges; base-8 rhythm.
5. **One accent** — name or section rules only; rest neutral.

## Workflow
1. Size: A4-ish (e.g. 794×1123 @96dpi feel) or user WxH. `create_frame` first.
2. Pick structure: **single column** or **sidebar + main** (≤2 columns).
3. Inventory user facts; mark missing slots — do not invent.
4. Type: restrained document faces from Available fonts; one display weight for **name only**.
5. Place sections; self-check scan path and overflow.
6. Edit with `move_nodes` / `update_node` — preserve column edges.

## Structure recipes
| Pattern | Use when | Ops sketch |
|---------|----------|------------|
| Single column | Dense content, ATS-like clarity | Stack section titles + body text |
| Left sidebar | Skills/languages/contact rail | Narrow sidebar shape + main column |
| Top header band | Strong name block | Header surface + contacts row; body below |

## Section order (default)
Name / title → contacts → summary (optional, ≤3 lines) → experience → education → skills → extras (certs/projects).

## Type roles
| Role | Feel |
|------|------|
| Name | Largest; one accent color allowed |
| Section title | Consistent size/weight; optional hairline |
| Body | ~10–12px-equivalent; comfortable measure |
| Meta | Dates, locations — smaller / muted |

## Canvas craft
- Section titles: consistent; optional hairline or muted bar — not heavy chrome.
- Spacing: base 8; section gaps > item gaps.
- Photo (only if user wants): small circle/rect in header/sidebar; never dominate.
- Columns: shared left edges; no 1–2px almost-misses.
- Experience items: role + employer + dates + 2–4 bullets max unless user provided more.

## Missing content protocol
| Situation | Action |
|-----------|--------|
| Critical contact/experience missing | Ask once; leave labeled gap if user skips |
| Optional summary missing | Omit section — do not invent |
| Photo not requested | Do not add stock headshot |

## Do not
- Festive illustration heroes or shape decoration piles
- Emoji section icons / clip-art
- 5+ type sizes or competing accents
- Invent content to “look complete”
- Turn CV into a marketing landing or poster

## Related
`frontend_ui` only if the brief is a resume **builder UI**, not the CV document itself. `ui_ux_pro_max` for overflow/contrast gate.

## Done when
Recruiter can scan name, latest role, and skills in seconds; margins even; no overflow; language matches user; SCENE ids only.
