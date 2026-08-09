# shadcn/ui composition

Map product UI onto the canvas with shadcn-like grammar — **no React tree**, only shapes + text (+ optional image).

Mature craft (shadcn/ui + Radix semantics + design-token roles): variants as roles, consistent radius/spacing, labeled states.

## Principles
1. **Roles, not one-off skins** — primary / secondary / ghost / destructive mean the same everywhere.
2. **Semantic color** — background / foreground / primary / muted / danger — not random “blue 500”.
3. **One radius + spacing rhythm** across the board.
4. **Labeled states** — never color alone for active/error/disabled.
5. **Compose from patterns** — invent chrome only if nothing fits.

## Workflow
1. Name the screen job (settings, dashboard, form, dialog, marketing section …).
2. Pull tokens from `frontend_ui` / `awesome_design_md` if available.
3. Compose from the pattern table; keep heights aligned within a control family.
4. Verify labels, errors, and primary action.
5. SCENE / FOCUS ids only.

## Pattern → canvas ops
| Need | Compose |
|------|---------|
| Button primary | Filled shape (role primary) + centered label; loading = visible state |
| Button secondary/ghost | Stroke or muted fill + label; same height as primary |
| Destructive | Danger fill/stroke + clear label |
| Input | Label text above; field shape; optional placeholder; error text adjacent |
| Form group | Related fields stacked with shared left edge; section title if needed |
| Card | Surface shape + title + body + optional action row |
| Table | Header row + aligned columns; zebra optional; no clipped cells |
| Nav | Top or side bar; items as text (active = weight **and** color) |
| Tabs | Row of labels; active underline/bar; panel below |
| Dialog / drawer | Overlay dim optional; panel with **title** + body + actions |
| Toast / alert | Compact surface + short message; icon optional but not emoji tofu |
| Badge / avatar | Small pill or circle + short text/initials |
| Skeleton | Muted bars matching content layout (loading) |
| Switch / checkbox | Affordances labeled by adjacent text — not color alone |

## Density notes
| Context | Lean |
|---------|------|
| Settings | Comfortable field spacing; clear section titles |
| Dashboard | Tighter tables OK; keep header distinct |
| Marketing embed | Fewer controls; one primary CTA |

## Do not
- Stack fields with only spacing and no labels
- Open dialog/drawer without a title
- Rely on color alone for state (add text/weight)
- Dump title/body/actions into one undifferentiated blob
- Mix Material festive icons into product UI chrome
- Emit React/JSX — canvas tool_ops only

## Related
`frontend_ui` (direction/tokens), `dashboard_ui` / `mobile_app_ui` / `landing_page` (surfaces).

## Done when
Hierarchy reads in one glance; interactive states are labeled; spacing rhythm is consistent; primary action is obvious; SCENE ids only.
