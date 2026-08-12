# Skill extensions (authoring)

Skill packs teach the Design Agent **how** to do a class of work. They are **not** executable plugins.

## Pack layout

```
plugins/skills/my_pack/          # or apps/api/seeds/design_skills/my_pack/
  _meta.json                     # required for plugins/ + .agents/
  SKILL.md                       # craft rules (required body)
```

Optional later (not Phase A): `assets/`, examples — ignored by the loader today except logos referenced from `_meta`.

## `_meta.json` (product fields)

| Field | Required | Notes |
|-------|----------|--------|
| `skill_key` / `id` / `name` | yes | Technical id; folder name used as fallback |
| `when_to_use` | recommended | Catalog + routing hint |
| `preferred_tools` | recommended | Live op allowlist for this skill |
| `triggers` **or** `trigger_keywords` | recommended | When Decide auto-attaches the skill |
| `version` | optional | e.g. `1.0.0` |
| `enabled` | optional | `false` skips the pack |
| `author` | optional | Metadata only |
| `permissions` | optional | Docs / future ACL; does **not** replace `preferred_tools` |
| `locales` | optional | `displayName` / `description` |

### `trigger_keywords` shortcut

```json
"trigger_keywords": ["中秋海报", "festival poster"]
```

expands to:

```json
"triggers": [
  {
    "intent_in": ["create", "edit"],
    "prompt_includes_any": ["中秋海报", "festival poster"]
  }
]
```

Prefer full `triggers` when you need `empty_canvas`, `min_prompt_chars`, etc. (see existing seed packs).

## `SKILL.md`

Natural-language craft: when to use images vs vectors, hierarchy, honesty rules, related skills. Keep it actionable — the model reads this in `SKILL_DETAILS`.

## Load / reload

| Mode | Behavior |
|------|----------|
| Local API | Scans dirs on ensure; hot reload polls disk (default every 2s) |
| Docker | Mount `./plugins/skills:/app/plugins/skills`; set `DESIGN_SKILLS_PLUGIN_DIRS` for extra paths |
| Admin | Zip import still available (`POST /api/v1/design/skills/import`) |

Duplicate `skill_key`: **later root wins** (plugins override seeds).

## Sample

See [`plugins/skills/festival_poster/`](../plugins/skills/festival_poster/) — chat: 「生成中秋红色海报」.

## Out of scope (later)

- `handler.py` / Python canvas SDK  
- Frontend toolbar plugins  
- `.recombyn-plugin` installer / signature  

→ [ADR 0013](./adr/0013-skill-extensions.md)
