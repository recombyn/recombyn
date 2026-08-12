# Skill extensions (authoring)

Skill packs teach the Design Agent **how** to do a class of work.

## Two roots only

| Path | Role |
|------|------|
| `apps/api/seeds/design_skills/<key>/` | Shipped product skills |
| `plugins/skills/<key>/` | Private / self-host extensions (Compose-mounted) |

Do **not** put product skills in `.agents/skills/` — that tree is for Cursor/IDE coding agents only.

## Canonical layout

```
my_poster_plugin/
├── _meta.json        # required
├── SKILL.md          # required
├── schema.json       # optional — input / output JSON Schema
├── handler.py        # optional — reserved (Phase B runner; not executed yet)
├── assets/           # optional — logo / icon / previews
└── examples/         # optional — reference art (not loaded by runtime)
```

Required today: `_meta.json` + `SKILL.md`.  
Everything else is optional; missing files are fine.

## `_meta.json`

| Field | Required | Notes |
|-------|----------|--------|
| `skill_key` / `id` / `name` | yes | Technical id |
| `when_to_use` | recommended | Catalog + routing |
| `preferred_tools` | recommended | Live op allowlist |
| `triggers` **or** `trigger_keywords` | recommended | Auto-attach |
| `version` / `enabled` / `author` | optional | `enabled: false` skips pack |
| `permissions` | optional | Docs only for now |

### `trigger_keywords` shortcut

Expands to a `create`/`edit` trigger with `prompt_includes_any` when `triggers` is absent.

## `schema.json` (optional)

```json
{
  "input": { "type": "object", "properties": { "...": {} }, "required": [] },
  "output": { "type": "object", "allowed_ops": ["create_frame", "create_text"] }
}
```

Aliases: `input_schema` / `output_schema`. Values merge into the skill row (meta fields win if both set). Used for validation hints / future runners — Phase A still relies on `preferred_tools` for live op gating.

## `handler.py` (optional, not run yet)

If present, the loader logs that it was found and continues. Phase B will allow a runner that **returns `tool_ops` only**. Until then, put craft in `SKILL.md`.

See `plugins/skills/festival_poster/handler.py.example`.

## `assets/` / `examples/`

- **`assets/icon.svg`** (or `logo.png`) — picked up as pack logo and inlined as a `data:` URL for the Skills list / `/` picker  
- `examples/` — human reference only

Shipped seeds already include `assets/icon.svg`.

## Load / reload

| Mode | Behavior |
|------|----------|
| Local API | Hot reload polls disk (default 2s) |
| Docker | `./plugins/skills:/app/plugins/skills` |
| Extra dirs | `DESIGN_SKILLS_PLUGIN_DIRS` |
| Admin zip | Still available |

Duplicate `skill_key`: **later root wins** (plugins override seeds).

## Sample

[`plugins/skills/festival_poster/`](../plugins/skills/festival_poster/) — 「生成中秋红色海报」.

## Out of scope here

- Frontend toolbar plugins (`manifest.json` + TypeScript) — [canvas-plugins.md](./canvas-plugins.md) (Phase B)
- Executing `handler.py` / sandboxes / `.recombyn-plugin` zip install — Phase C/D

→ [ADR 0013](./adr/0013-skill-extensions.md)
