# Big-co alignment roadmap

Living checklist for Recombyn platform maturity. Phase 1 tooling is in flight ([PR](https://github.com/recombyn/recombyn/pull/104)); this doc also maps a **big-co AI canvas backend** reference model onto what we adopt **now vs later**.

## North star (how we borrow)

| Principle | Meaning for Recombyn |
|-----------|----------------------|
| **Standards first, topology second** | Commitlint / ADR / turbo / gates before splitting repos or services |
| **Modular monolith → extract** | Keep one deployable API until a domain has clear scale/failure/team boundary |
| **Vertical slice** | Each async/obs/security item ships one production path, not a rewrite |
| **OSS + self-host honesty** | Prefer K8s/MySQL HA as *deploy options*, not hard product requirements for every install |

---

## Reference model → our mapping

### 1. 仓库研发体系

| Reference | Status | Next |
|-----------|--------|------|
| Turborepo / monorepo | Done (P1) | Remote cache (Vercel/Turbo) when CI time hurts |
| Git 规范 + ADR | Done (P1) | Enforce ADR link in PR template |
| TDD / 分层测试 | Partial (unit + e2e + gates) | Coverage floor on **new** API routes |
| CODEOWNERS | Done (P2) | Keep owners current as teams grow |
| CI + 远程缓存 | Partial (Actions) | Unify lint→typecheck→test→e2e pipeline (P4) |
| 内外仓隔离 | N/A for now | Keep public OSS; secrets only in private env / desktop |

### 2. 架构形态（勿一上来微服务）

Reference wants：网关 / 用户权限 / 画布存储 / 素材 / AI 中台 / 异步集群 / 协同.

**Borrow as bounded contexts inside the modular monolith + already-split collab:**

| Domain | Today | Extract when… |
|--------|-------|----------------|
| 网关 | FastAPI router + rate limit | Multi-region / multi-product edge |
| 用户权限 | Auth + wallet flags | Dedicated IdP / multi-tenant org RBAC |
| 画布存储 | Projects API + scene doc | Shard / multi-region document service |
| 素材资产 | Uploads / S3 hooks | CDN + virus scan + huge media pipeline |
| AI 模型中台 | In-process façade (`resolve_chat_endpoint` / `chat_model_for`) | Extract gateway only with multi-product scale |
| 异步任务 | Celery deps present; most still sync | First job vertical (export / hydrate) |
| 协同 | **`apps/collab` already separate** | Scale WS fleet independently (already can) |

→ See [ADR 0004](../adr/0004-modular-monolith-first.md).

### 3. 异步任务体系

| Reference | Status | Next (Phase 2) |
|-----------|--------|----------------|
| 消息队列 / 优先级 / 重试 / DLQ | Celery hydrate autoretry + metrics | DLQ when failure rate known |
| AI / 导出 / 渲染异步 | Hydrate jobs API + apply enqueue | Export / long paint off request |
| 前端流式进度 | SSE / agent stream exists | Unify **task_id → progress events** for jobs |

### 4. 存储分层隔离

| Reference | Status | Next |
|-----------|--------|------|
| MySQL 主从 / 分库分表 | SQLite/MySQL via settings | Document HA as ops guide; shard only with metrics |
| Redis 多级缓存 | Redis for collab wait / Celery | Cache hot project meta; no premature cluster |
| 协同日志独立 | Yjs room vs project DB | ADR when splitting durable Yjs persistence |
| 对象存储 | S3-compatible hooks | Default path for uploads in prod compose |
| 向量库检索 | CLIP/memory optional | Keep optional extra; not core path |
| 配置中心 | env / Settings | Stay env-based until multi-cluster |

### 5. 可观测运维

| Reference | Status | Next (Phase 3) |
|-----------|--------|----------------|
| OTel 全链路 | Correlation `trace_id` (ADR 0007) | Full OTel SDK later |
| 结构化日志 | `LOG_JSON` + redaction | Keep human default locally |
| Prometheus | `/metrics` + Grafana + hydrate fail alert | Queue depth panels |
| 自动告警 | Prom rules (5xx / p95 / deps / hydrate) | Webhook contact points |

### 6. 部署环境

| Reference | Status | Next (Phase 4+) |
|-----------|--------|-----------------|
| K8s / 多 AZ | Compose / self-host docs | Optional k8s manifests later |
| 扩缩容 / 灰度 / 回滚 | Manual | Docker tag + rollback runbook first |
| 混沌工程 | No | Only after async + obs baselines |

### 7. 安全与商业化基建

| Reference | Status | Next |
|-----------|--------|------|
| 细粒度 RBAC | Coarse user/admin + [docs](../security-rbac.md) | Resource×action when orgs land |
| 文件查杀 / 内容安全 | Magic sniff + optional AV hook (ADR 0008) | Wire ClamAV in prod compose optionally |
| 限流防刷 | Per-route rate limits | Tune; abuse playbooks |
| 配额 / 计费 | Wallet + holds exist | Turn on carefully; audit ledger |
| 脱敏 / 安全审计 | Log redaction partial | SECURITY.md process + dep audit CI |

---

## Execution phases (unchanged order, richer goals)

### Phase 1 — Foundation

- [x] Turborepo, `@repo/tsconfig`, `@repo/eslint-config`
- [x] husky + commitlint
- [x] `docs/adr` + seed ADRs
- [x] `npm run dev:stack`
- [ ] Full web `tsc` clean (tech debt)
- [x] `CODEOWNERS` + PR template (ADR checkbox)

### Phase 2 — Backend productionization (async + AI platform)

- [x] ADR: async job boundary (priority deferred; poll contract; Redis + Celery) — [0005](../adr/0005-async-job-boundary.md)
- [x] First vertical async job: `POST/GET /api/v1/design/hydrate/jobs` + `run_image_hydrate_job`
- [x] `npm run dev:worker` (+ CODEOWNERS / PR template)
- [x] Wire hydrate job into Design Agent apply/action (`hydrate_tool_ops_images` → Celery, stall fallback)
- [x] LLM adapter ADR + thin façade (model 中台 **in-process** first) — [0006](../adr/0006-llm-facade-memory-tiers.md)
- [x] Memory tiers documented (session / project / global → `agent_memory`) — same ADR
- [x] Alembic single-head CI gate (`test_alembic_single_head`)
- [x] Coverage floor on hydrate jobs route (`--cov-fail-under=95`)
- [x] Celery transient retry + `recombyn_hydrate_jobs_total` metrics (DLQ still deferred)

### Phase 3 — Observability & security

- [x] Correlation + structured logs (ADR 0007; `trace_id` on hydrate API→worker; `LOG_JSON`)
- [x] Prometheus hydrate failure alert (+ existing RED / dep rules)
- [x] Dependency audit CI (pip-audit + npm audit, soft gate)
- [x] Upload hardening (MIME magic sniff + optional AV hook) — [0008](../adr/0008-upload-content-validation.md)
- [x] RBAC notes + security process docs — [security-rbac.md](../security-rbac.md)
- [ ] Full OTel SDK when cross-service spans are required

### Phase 4 — CI/CD & deploy options

- [x] Unified CI umbrella (`ci.yml`: lint → contracts typecheck → unit → web build) — [0009](../adr/0009-unified-ci-rollback.md)
- [x] CHANGELOG + semver tagging convention; Docker Compose rollback runbook
- [x] GHCR / Docker publish workflow on tags (`release-docker.yml` + `docker-compose.ghcr.yml`)
- [x] Tauri signing docs + unsigned `desktop-build.yml` (dispatch) — [0010](../adr/0010-desktop-signing.md)
- [x] k8s deferred (compose/GHCR default) — `deploy/k8s/README.md`
- [ ] Require `typecheck:web` once Phase 1 tsc debt is cleared

### Phase 5 — Stress

- [x] Baseline runbook for collab/canvas/k6/agent stress — [stress-baselines.md](../stress-baselines.md)
- [ ] Dual-client collab conflict + paid-gen E2E (tracked gaps)
