# AgentProfile & forked sub-agents

Design Agent 的**产品行为**（阶段协议、路由 KV、角色隔离、可 spawn 子代理）由 YAML Profile 驱动；**执行内核**仍是 LangGraph `canvas_ops_v1`。

相关：自托管总览 [self-hosting.md](./self-hosting.md) · 种子目录 [apps/api/seeds/README.md](../apps/api/seeds/README.md) · bindings [agents/README.md](../apps/api/seeds/agents/README.md)

## Goals / non-goals

| | |
|--|--|
| **Goal** | Kernel 固定；换人格 = 换 Profile（Voice / Surface / Policy / Topology 模板 / Contracts / 子代理目录） |
| **Non-goal** | Admin 流程图 JSON 当 live executor；用「更大的 system prompt」当全域配置 |
| **Live ≠ Admin** | Admin flow 可视化 / dry-run 不等于 `graph/build.py` 注册表里的 template |

## Files

| Path | Role |
|------|------|
| `apps/api/seeds/agents/bindings.yaml` | `product` / `surface` → Profile id（默认 `design.canvas`） |
| `apps/api/seeds/agents/profiles/design.canvas.yaml` | Live Design Agent Profile |
| `app/services/design/runtime/agent_profile.py` | Load / validate / contracts / tool host / `$kv` |
| `app/services/design/runtime/subagent.py` | Forked spawn + catalog + Redis job results |
| `app/services/design/runtime/host/resources.py` | Deferred `need_tools` / `need_skills` / `need_subagents` |
| `app/services/design/runtime/graph/nodes/review.py` | Review Agent（forked） |
| `app/services/design/runtime/graph/build.py` | Template registry (`canvas_ops_v1`) + review 边 |

## Resolve which Profile

Priority（`resolve_profile_id`）：

1. **显式** `profile_id`（调用方传入）
2. **环境 / settings** `AGENT_PROFILE_ID`（默认 `design.canvas`；设空串则跳过此层走 bindings）
3. **`bindings.yaml`**：按 `when.product` / `when.surface` 首条匹配
4. **`bindings.default`**（缺省仍回落 `design.canvas`）

```yaml
# seeds/agents/bindings.yaml
default: design.canvas
bindings:
  - id: editor-design
    when: { product: canvas, surface: editor }
    profile: design.canvas
```

## Profile shape (`design.canvas`)

```yaml
apiVersion: recombyn.agent/v1
kind: AgentProfile
id: design.canvas
identity.prompts.stages:   # stage → prompt pack kind
topology.template: canvas_ops_v1
topology.stages_enabled: [intent, decide, paint, observe, review]
topology.loops:            # e.g. review must_fix → paint max: 2
roles:                     # primary shared_state + specialist forked_context
subagents:                 # spawn catalog (forked specialists)
contracts:                 # stage → Pydantic schema id
capabilities:              # tools / skills catalogs
routing / runtime:         # $kv: overlays onto Admin KV rules
```

| Block | Owns |
|-------|------|
| `identity.prompts` | Voice：persona / overlays / 每 stage 的 pack kind |
| `topology` | 选哪个 LangGraph template、哪些 stage 进图、retry loops |
| `roles` | primary vs specialists；谁 `shared_state` / `forked_context` |
| `subagents` | Decide `need_subagents` 目录 + graph fork 定义 |
| `contracts` | stage → schema id（如 `DecideTurn.v1`） |
| `capabilities` | tools / skills catalog、defer、namespaces |
| `routing` / `runtime` | 模型 lane、flags、memory/attach 限额 |

- **`$kv:ruleKey`**：从 Admin KV 拷贝到该字段；**字面量**覆盖 KV
- **`topology.template`** 必须是 live 注册表里的 builder（当前仅 `canvas_ops_v1`）
- Catalog-only stages（`vision_scout` / `research`）可写在 `identity.prompts.stages`，**不必**进 `stages_enabled`（不占图节点）

### Sub-agent entry fields

```yaml
subagents:
  research:
    description: "…"          # Decide catalog 文案
    isolation: forked_context # 目前 spawn 路径按 fork 语义
    model: $kv:precheck.router_model
    stage: research           # → prompts.stages + contracts
    system: agent.prompt.research_system
    contract: ResearchTurn.v1
    tools: []                 # 预留；当前 fork 多为 structured turn
    max_turns: 1
    parallel: true            # false → 不可与其它子代理 gather
```

## Live graph (`canvas_ops_v1`)

```text
START → bootstrap
          ├─ apply_ops? → apply_confirm → observe → …
          └─ memory → intent_classify → design_agent (decide)
                           ├─ chat / ask → settle
                           └─ create/edit → paint_ops
                                  ├─ Ask → propose → settle
                                  └─ Agent → action → observe
                                         ├─ structural critique fail → paint_ops
                                         ├─ ok + review enabled → review (fork)
                                         │      ├─ must_fix + budget → paint_ops
                                         │      └─ pass / exhausted → settle
                                         └─ review disabled → settle
```

| Node | Isolation | Notes |
|------|-----------|--------|
| `design_agent` | shared | Decide only; `need_*`; no canvas ops |
| `paint_ops` | shared | Structured `tool_ops` |
| `observe` | shared | FE `interrupt` + deterministic critique |
| `review` | **forked** | Fresh system+task; Profile `subagents.review` |
| `propose` / `action` / settle | shared | Ask hold / emit ops / finish |

### Env knobs

| Key | Default | Notes |
|-----|---------|--------|
| `AGENT_PROFILE_ID` | `design.canvas` | Active Profile id（见上） |
| `DESIGN_REVIEW_AGENT_ENABLED` | true | Off → observe 后跳过 LLM Review |
| `DESIGN_CRITIQUE_ENABLED` | true | Structural critique before Review |
| `DESIGN_GRAPH_NODE_TIMEOUT_SEC` | 180 | Per-node timeout |
| `DESIGN_GRAPH_RETRY_ATTEMPTS` | 3 | 通用节点；**review / observe 固定 `max_attempts=1`**（避免 3×180s 挂死） |

Review 重试预算：`rt.flags.review_left` ← Profile `topology.loops`（`from: review` / `when: must_fix` / `to: paint` 的 `max`）。

## Decide resources (`need_*`)

Decide 协议 pack：`agent.prompt.need_tools_overlay`。

| Field | Host action |
|-------|-------------|
| `need_tools` | Inject `TOOL_DETAILS` |
| `need_skills` | Inject `SKILL_DETAILS`（+ auto skill triggers） |
| `need_subagents` | Spawn Profile catalog children → `SUBAGENT_RESULTS` |

`need_subagents` 形状：

```json
["vision_scout"]
[{"id":"research","task":"…","background":false}]
[{"job_id":"abc123"}]
```

- **同步**：await fork，结果进 `pending_subagent_details`，下一轮用 `agent.prompt.pending_subagents` 回注
- **background**：立刻返回 `job_id`；结果写**本进程内存** + Redis `design:subagent_job:*`（TTL 1h）；下轮 harvest / `{"job_id":…}` poll

### Auto-triggers（即使模型未声明 `need_*`）

| Condition | Spawn |
|-----------|--------|
| 有参考图 | `vision_scout` |
| 空画布 + create/edit + 文案够长 + 无图 | `research` |

去重：`run.subagents_loaded`。

## Sub-agent catalog (shipped)

| Id | Contract | When |
|----|----------|------|
| `review` | `ReviewTurn.v1` | Graph stage after observe（也可 Decide 声明） |
| `vision_scout` | `VisionScoutTurn.v1` | Refs / brief 视觉侦察 |
| `research` | `ResearchTurn.v1` | 文案 brief 受众/调性/方向 |

Fork 语义：

- **新消息列表**：system + 本轮 task（可带图）
- **不带**父 Agent 聊天 transcript
- 进程内 async（**不是** OS 子进程）；`parallel: true` 可 `gather`

新增子代理步骤：

1. Profile `subagents.<id>` + `contracts.<stage>`（若 stage 独有）
2. Pack `agent.prompt.<…>_system.md` + `_index.json`
3. Pydantic schema 注册进 `ensure_contract_registry()`
4. （可选）`resolve_auto_need_subagents` 触发条件
5. 若要占图节点：写进 `topology.stages_enabled` + `build.py` 边（如 `review`）

## Prompt packs（子代理相关）

| Kind | Role |
|------|------|
| `agent.prompt.need_tools_overlay` | Decide 资源协议（含 `need_subagents`） |
| `agent.prompt.review_system` | Review |
| `agent.prompt.vision_scout_system` | Vision Scout |
| `agent.prompt.research_system` | Research |
| `agent.prompt.pending_subagents` | 结果回注一句 |

Boot：`ensure_design_prompt_packs` **以 git seed 为准** upsert（body / title / used_by / when / scenes / pack_type / sort_order）。改 `stages/*.md` 或 `snippets.md` 后重启 API（或再跑 ensure）即进 DB；Admin UI 改文案下次 ensure 会被 seed 覆盖。

## Limits / caveats

- Background spawn 结果靠 **同进程 async + Redis 结果仓**；跨 worker 只共享结果，不保证「谁起的任务」在另一 worker 上继续跑。
- 当前仅一个 live template：`canvas_ops_v1`。新拓扑 = 新 builder 注册，不是 Admin 自由连线。
- FE 对 Review / subagent SSE 的专用表面可能仍在演进；协议以运行时 emit 为准。
- OpenAPI / `packages/contracts` 若仍广告已删路由，需重新 `gen` 后对齐。

## Local smoke / E2E

```bash
# API（WatchFiles 重载偶发挂掉时重启）
npm run dev:api
```

有参考图的路径才会自动 `vision_scout`。

单元：`apps/api/tests/unit_tests/test_agent_profile.py` · `test_subagent_spawn.py`

## Code map

```text
bindings.yaml ──► resolve_profile_id
profile YAML  ──► AgentProfile
                    ├─ assemble_stage_system (Voice)
                    ├─ apply_profile_rules   (Policy $kv)
                    ├─ roles / subagents
                    └─ contracts → structured LLM

decide ── need_* ──► host/resources.load_deferred_resources
                      ├─ tools / skills
                      └─ subagent.run_subagent(s) / background+Redis

observe ──► stash preview/signals ──► review (fork) ──► settle | paint
```
