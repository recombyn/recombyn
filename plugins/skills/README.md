# Skill plugins (`plugins/skills`)

Private / self-host **Skill packs**. Same layout as shipped `apps/api/seeds/design_skills/`.

## Canonical pack layout

```
my_poster_plugin/
├── _meta.json        # required — triggers, preferred_tools, id/version
├── SKILL.md          # required — Agent craft rules
├── schema.json       # optional — input / output JSON schema
├── handler.py        # optional — ignored until Phase B (ops runner)
├── assets/           # optional — icon.svg / logo (list + picker thumb)
└── examples/         # optional — reference images (docs only today)
```

Skills are **playbooks**: the Design Agent still emits `tool_ops`. There is no separate canvas Python SDK in Phase A.

## Two product roots only

| Root | Who |
|------|-----|
| `apps/api/seeds/design_skills/` | Shipped / first-party |
| `plugins/skills/` | Private deploy mount |

`.agents/skills/` is for Cursor/IDE agents only — **not** loaded by the Design Agent.

## Add a pack

1. Create the folder under `plugins/skills/<key>/` with at least `_meta.json` + `SKILL.md`.
2. Restart API, or wait for hot reload.
3. Chat with a trigger (sample: 「生成中秋红色海报」 → `festival_poster`).

## Docker

```yaml
volumes:
  - ./plugins/skills:/app/plugins/skills
```

Extra roots: `DESIGN_SKILLS_PLUGIN_DIRS=...`

See [docs/skill-extensions.md](../docs/skill-extensions.md).
