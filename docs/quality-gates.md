# Quality gates

Two gates, one metrics truth.

## Gate A — Correctness

| Tool | Role | Command |
|------|------|---------|
| **Pytest** | API contracts | `npm run test:api` |
| **Playwright** | UI / collab journeys | `npm run test:e2e` |
| **Vitest** | Pure canvas/geometry | `npm run test:web` |
| **Eval** | Design Agent craft | `npm run eval:agent` |

CI mints `E2E_TOKEN` via `scripts/ci-mint-token.mjs` (`SUPER_ADMIN_TEST_CODE`, **max 8 chars**).
Collab dual-WS: set `E2E_COLLAB_WS` (CI sets this). Category eval: `E2E_EVAL=1`.

## Gate B — Performance & stability

| Tool | Role | Command |
|------|------|---------|
| **k6** | Load | `perf:k6:smoke` / `api` / `soak` / `collab` |
| **Prometheus** | Scrapes `/metrics` + alert rules | compose `:9090` |
| **Grafana** | SLO dashboards | compose `:3001` (admin / recombyn) |

```bash
docker compose up -d api prometheus grafana
# restart API after metrics code change
curl -s http://127.0.0.1:8000/metrics | head

SUPER_ADMIN_TEST_CODE=… npm run ci:mint-token
npm run perf:k6:smoke
PERF_TOKEN="$(cat .tmp-token.txt)" npm run perf:k6:api
COLLAB_WS_URL=ws://127.0.0.1:1234 npm run perf:k6:collab
```

### Alert rules

`deploy/observability/prometheus/rules/recombyn.yml`:

- 5xx rate > 5% (5m)
- p95 latency > 2s (10m)
- DB / Redis gauge down (2m)

View in Prometheus **Alerts**. Wire Grafana contact points locally (do not commit secrets).

### CI workflows

| Workflow | When |
|----------|------|
| `e2e-tests.yml` | PR — API + collab + minted token + Playwright |
| `perf-k6.yml` | PR — smoke + api_crud + collab_ws |
| `nightly-quality.yml` | Nightly — eval suite shape + k6 soak |

## Layout

| Path | Purpose |
|------|---------|
| `perf/k6/` | Gate B scenarios |
| `eval/design-agent/` | Agent quality eval |
| `deploy/observability/` | Prometheus + Grafana |
| `scripts/ci-mint-token.mjs` | CI/local session mint |
| `apps/api/seeds/design_agent_eval_suite.json` | Eval cases |

## Design Agent observe / placement

See [agent-profile.md — Observe ↔ scene feedback](./agent-profile.md#observe--scene-feedback-do-not-infinite-repaint) for artboard vs viewport and anti-repaint guards.
