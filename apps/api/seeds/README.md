# API seeds

Cold-start tree for `apps/api`. Boot **upserts** prompt packs from seed (body/meta follow git; Admin UI edits are overwritten on next ensure).

Owner docs: [self-hosting.md](../../../docs/self-hosting.md) · AgentProfile: [agent-profile.md](../../../docs/agent-profile.md)

## Layout


| Path                                                                     | Contents                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| `agents/bindings.yaml`                                                   | product/surface → Profile id                      |
| `agents/profiles/*.yaml`                                                 | AgentProfile YAML (`design.canvas`)               |
| `design_prompt_packs/`                                                   | `_index.json` + `stages/*.md` + `snippets.md` (pack sections) |
| `design_skills_seed.json`                                                | Core skill playbooks                              |
| `design_skills/<key>/`                                                   | Ext skill packs (`_meta.json` + `SKILL.md`) — e.g. brush, motion, poster, resume, ecommerce, landing, frontend_ui, dashboard_ui, mobile_app_ui |
| `canvas_actions_seed.json`                                               | Canvas tool registry                              |
| `fonts_seed.json` · `design_tokens_seed.json` · `design_dicts_seed.json` | Fonts / tokens / dicts                            |
| `llm_models_seed.json`                                                   | Model catalog seed                                |
| `stage_rule_defaults.json` · `progress_stages.json`                      | Platform KV defaults / progress labels            |


Helpers in code: `resolve_seed_dir` / `resolve_seed_file` / `api_seeds_dir`（原 `data/` 已迁到 `seeds/`）。