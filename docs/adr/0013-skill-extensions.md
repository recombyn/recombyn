# Extensibility — Skill packs (Phase A)

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

We want third-party / private-deploy **extensions** without a full plugin platform (canvas SDK, Python handlers, sandboxes). The Design Agent already loads file skill packs (`_meta.json` + `SKILL.md`) and gates ops via `preferred_tools`.

## Decision

1. **Phase A = Skill playbooks only.** A “skill plugin” is a folder the agent can load; it does **not** execute arbitrary Python (`handler.py` deferred).
2. **Mount roots** (later wins on duplicate `skill_key`):
   - `<repo>/.agents/skills` (product `_meta.json` required)
   - `apps/api/seeds/design_skills`
   - `<repo>/plugins/skills` (default private mount)
   - Extra dirs from `DESIGN_SKILLS_PLUGIN_DIRS` (comma-separated)
3. **Meta aliases** (optional, normalized at load):
   - `id` → `skill_key`
   - `trigger_keywords` → `triggers[].prompt_includes_any` (when `triggers` absent)
   - `enabled: false` → skip pack
   - `author` / `permissions` → recorded / documented; live ACL remains `preferred_tools` + `allowed_resources`
4. **Later phases** (not this ADR): canvas toolbar plugins (TS registry), optional skill `ops` runners, zip/signature installers.

## Consequences

### Positive

- Private deploys add craft by dropping folders + restart/hot-reload.
- Same Decide / Paint / tool_ops path as shipped skills — no second canvas writer.
- Compose can volume-mount `./plugins/skills` without rebuilding the image.

### Negative / trade-offs

- Deterministic layout still depends on the LLM following `SKILL.md`.
- No process sandbox for skill bodies (they are prompts, not code).

## Alternatives considered

1. **Runnable `handler.py` + CanvasContext** — deferred; conflicts with tool_ops ownership and needs a runner ADR.
2. **Only Admin zip uploads** — kept, but filesystem mount is better for self-host ops.

## References

- [docs/skill-extensions.md](../skill-extensions.md)
- `plugins/skills/README.md`
- `app/services/design/prompts/skill_store/pack_io.py`
- Roadmap Phase A in [platform.md](../roadmap/platform.md)
