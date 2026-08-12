# Skill plugins (`plugins/skills`)

Private / self-host **Skill extension** packs (Phase A). Same format as `apps/api/seeds/design_skills/`: `_meta.json` + `SKILL.md`.

Skills are **playbooks for the Design Agent** (triggers + preferred tools + craft text). They do **not** run `handler.py`. The agent still emits `tool_ops` through the existing canvas tool host.

## Add a pack

1. Create `plugins/skills/<key>/_meta.json` and `SKILL.md` (see [docs/skill-extensions.md](../docs/skill-extensions.md)).
2. Restart API, or wait for hot reload (`DESIGN_SKILLS_HOT_RELOAD`, default on).
3. Chat in the editor with a trigger phrase (e.g. sample pack: 「生成中秋红色海报」).

## Docker

Compose mounts this folder into the API container:

```yaml
# docker-compose.yml (api service)
volumes:
  - ./plugins/skills:/app/plugins/skills
```

Extra roots: `DESIGN_SKILLS_PLUGIN_DIRS=/other/path,/another` (comma-separated).

## Sample

`festival_poster/` — holiday poster playbook (plugin-style `_meta` aliases: `id`, `trigger_keywords`, `permissions`, `author`).
