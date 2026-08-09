# Frontend UI direction

Canvas adaptation of Anthropic **frontend-design**: commit a bold, specific point of view, then execute with `tool_ops` (shapes + text + optional images) — **not** React/CSS code.

## Principles
1. **Intentionality over intensity** — bold maximalism and refined minimalism both work if committed.
2. **One signature** — spend boldness on one memorable element; keep surroundings quiet.
3. **Tokens before chrome** — colors, type roles, spacing, radius locked before painting widgets.
4. **Anti-slop** — refuse generic AI faces unless the brief asks for them.
5. **Copy is design material** — verbs, errors, and empty states are part of the UI craft.

## Workflow
1. Name subject, audience, and the screen's **one job**.
2. Commit **one** aesthetic direction (brutally minimal / editorial / industrial / soft organic / luxury / playful geometric / retro-futurist …). Note one real creative risk.
3. Build a compact token sheet (thought only): 4–6 named color roles, display+body(+utility) type, spacing step, signature element.
4. Critique against anti-defaults; revise if generic.
5. `create_frame` → place chrome and content inside FOCUS → self-check hierarchy and contrast.
6. Defer layout surfaces to specialized skills (table below).

## Anti-defaults (unless brief asks)
1. Warm cream `#F4F1EA` + terracotta serif cliché  
2. Near-black + single acid-green/vermilion accent template  
3. Broadsheet hairlines / zero-radius dense newspaper columns  
Also avoid: purple→indigo on white; Inter/Roboto/Arial as the whole system; glow + pill spam; Space Grotesk-as-default convergence.

## Signature
Hero type, asymmetric crop, distinctive nav, bold empty, unexpected layout break — pick **one**. Cut decoration that does not serve the job.

## Tokens → canvas
| Token | Ops |
|-------|-----|
| Color roles | bg / surface / foreground / primary / muted / danger → fills/strokes |
| Type | Catalog fonts only; display restrained; body readable; no invented faces |
| Spacing | Base 4 or 8; align columns; no 1–2px almost-misses |
| Radius/stroke | One shared scale |

## Screen recipes
| Screen | Lean | Also load |
|--------|------|-----------|
| Settings / form | Labeled fields, section groups, one save | `shadcn_ui` |
| List / table | Scannable rows, filters | `dashboard_ui` |
| Marketing section | Thesis + CTA | `landing_page` |
| Phone shell | Single column, thumb CTA | `mobile_app_ui` |
| Empty state | Short invite + one action | `shadcn_ui` |

## UI copy (design material)
- Name by what users control ("Save changes", not "Submit" / "webhook config").
- Active voice; same verb through the flow (Publish → Published).
- Errors: what failed + how to fix; empty states: invite an action.
- Match user language; sentence case; no filler.

## Do not
- Ship AI-default purple/Inter/cream-terracotta faces without brief permission
- Invent brand logos or marketing claims
- Decorate product UI with festive poster chrome
- Spray the Skills catalog — prefer 1–3 tightly matched keys
- Implement React/CSS — this canvas uses tool_ops only

## Related
`shadcn_ui` (controls), `dashboard_ui` / `mobile_app_ui` / `landing_page` (surfaces), `awesome_design_md` (brand sheet), `garden_style` (taste).

## Done when
Direction is specific to this brief; one signature; no AI-default face; hierarchy and contrast readable; tokens consistent; SCENE ids only.
