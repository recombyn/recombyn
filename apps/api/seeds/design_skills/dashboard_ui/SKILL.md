# Dashboard / admin UI

Playbook for **后台 / dashboard / console** — scannable density, clear IA, honest empty states.

## Principles
1. **Shell before widgets** — sidebar + top bar + main; then KPIs and tables.
2. **Scan in ~2s** — nav + KPIs + primary content readable immediately.
3. **Honest data** — never invent KPI numbers, series, or logos; use user values or "—".
4. **One primary per region** — Create/Apply stays obvious; rest ghost/secondary.
5. **Density with rhythm** — base-8; section gaps > item gaps; not cramped noise.

## Workflow
1. Desktop-ish size (e.g. 1440×900) unless asked mobile (then prefer `mobile_app_ui`).
2. Load `shadcn_ui` when crafting dense chrome from scratch.
3. Build shell → KPI row → main (table **or** card grid) → filters.
4. Wire loading/empty/error states as muted structures, not blank voids.
5. Self-check alignment and role consistency.

## Shell
| Region | Compose |
|--------|---------|
| Sidebar | Narrow vertical; logo/mark + nav; active = weight **and** color |
| Top bar | Title / breadcrumbs / search / user chip — quiet |
| KPI row | 3–4 equal cards: label + value; aligned baselines |
| Main | Table **or** card grid — pick one primary |
| Filters | Row above table; labeled controls; one primary Apply if needed |

## Modules
| Module | Notes |
|--------|-------|
| KPI card | Surface + muted label + bold value |
| Table | Header distinct; column-aligned body |
| Skeleton | Muted bars matching final layout |
| Chart | Simple bar/line — no fake precision labels |
| Primary button | Filled primary + verb from user language |

## IA patterns
| Pattern | When |
|---------|------|
| Filters + table | Operational lists, orders, users |
| KPI + chart + table | Analytics overview |
| List + detail | Master/detail |
| Cards grid | Entity galleries |

## States
- **Loading**: muted skeleton matching layout.
- **Empty**: short message + one CTA.
- **Error**: what failed + next step.

## Placeholder grammar
| Missing | Show |
|---------|------|
| Metric value | `—` with label kept |
| Chart series | Empty plot or omit series |
| Logo | Text mark — do not invent brand marks |

## Do not
- Marketing hero / festive illustration as the whole board
- Five equal CTAs; rainbow accents; emoji as nav icons
- Invent analytics facts or “sample” revenue
- Desktop-density tables as the default on phone frames

## Related
`shadcn_ui` (controls), `mobile_app_ui` (if phone console).

## Done when
Nav + KPIs + main content readable in ~2s; alignment crisp; roles consistent; no invented metrics.
