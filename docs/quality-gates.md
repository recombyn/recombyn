# Quality gates

Local / CI gates for Recombyn. Monorepo foundation (Turborepo, shared configs, ADR): see [`docs/roadmap/bigco-alignment.md`](./roadmap/bigco-alignment.md) and [`docs/adr/`](./adr/README.md).

## Quick commands

| Command | Purpose |
|---------|---------|
| `npm run check` | Web ESLint + contracts `tsc` (via Turborepo) |
| `npm run lint` / `typecheck` | Turbo lint / contracts typecheck |
| `npm run dev:stack` | Vite web + collab WS together |
| `npm run dev:api` / `dev:worker` | API + Celery worker (hydrate/import jobs) |
| `npm run test:gate:a` | Gate A quality script |
| `npm run test:canvas:stress` | Canvas store + E2E stress matrix |

Two gates, one metrics truth. Local full matrix: **`npm run test:gate:full`** (or `test:gate` / `test:gate:a` / `test:gate:b`).

## Gate A — Correctness

| Tool | Role | Command |
|------|------|---------|
| **Pytest** | API contracts | `npm run test:api` (uses `apps/api/.venv` when present) |
| **Functional API** | All product HTTP surfaces | `npm run test:functional:api` |
| **Functional UI** | All major routed shells | `npm run test:functional:e2e` |
| **Playwright** | UI / collab / surface + full shells | `npm run test:e2e` |
| **Vitest** | Pure canvas/geometry | `npm run test:web` |
| **Agent stress** | Design craft + system cases | `npm run stress:agent` (+ `--system`) |
| **Eval** | Design Agent craft | `npm run eval:agent` |

```bash
# Prefer 127.0.0.1 (Vite binds host 127.0.0.1). Token optional for smoke; required for journeys.
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:gate:a
# Full product surface smokes (API + UI shells):
npm run test:functional
# With token + live API: includes agent stress when using test:gate / test:gate:full
npm run test:gate
```

### Functional coverage matrix

`test:functional` hits every major product surface at smoke depth:

| Surface | API suite | E2E shell |
|---------|-----------|-----------|
| Health / metrics | ✓ | — |
| Auth (config/me/captcha) | ✓ | login route |
| Wallet / BYOK / liked | ✓ | account tabs (profile/agent/usage) |
| Projects CRUD + collab token | ✓ | mine + editor |
| Shares | ✓ | `/s/:id` |
| Plaza feed/mine | ✓ | inspiration tabs |
| Design catalog/tools/skills | ✓ | skills nav |
| Chat models/tools/sessions | ✓ | — |
| Image tools / import validation | ✓ | — |
| Admin (users/plaza/fonts/…) | ✓ | — |
| Notices / fonts / assets / users search | ✓ | account/home |

Canvas Image/Video/Audio/Lottie generator plates + text tool (browser, no paid gen): `npm run test:canvas:generators` (`e2e/tests/canvas.generators.spec.ts`). Store spawn/finish covered by Vitest `canvasGenerators.store` + `quickEditGenPromptEcho.stress`.

Full canvas stress matrix (store + RCB + foundations/generators/ops/deep/tools E2E): `npm run test:canvas:stress`. Deep: `npm run test:canvas:deep`. Tools: `npm run test:canvas:tools` (image AI panels, align/boolean, density, video trim).

Paid gen finish, OCR worker, OAuth/OTP, and dual-client collab conflict remain Gate A agent/eval + journeys — not duplicated here.

CI mints `E2E_TOKEN` via `scripts/ci-mint-token.mjs` (`SUPER_ADMIN_TEST_CODE`, **max 8 chars**).
Collab dual-WS: set `E2E_COLLAB_WS` (CI sets this). Category eval: `E2E_EVAL=1`.
E2E workers default to **2** (`E2E_WORKERS` to override) to avoid auth rate-limit flake.

## Gate B — Performance & stability

| Tool | Role | Command |
|------|------|---------|
| **k6** | Load | `npm run perf:k6:smoke` / `perf:k6:api` / `perf:k6:soak` / `perf:k6:collab` |
| **Prometheus** | Scrapes `/metrics` + alert rules | compose `:9090` |
| **Grafana** | SLO dashboards | compose `:3001` (admin / recombyn) |

```bash
docker compose up -d api prometheus grafana
# Heavy load: restart API with RATE_LIMIT_ENABLED=false
curl -s http://127.0.0.1:8000/metrics | head

SUPER_ADMIN_TEST_CODE=… npm run ci:mint-token
npm run test:gate:b
# or:
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
| `scripts/run-quality-gate.mjs` | Unified Gate A/B runner |
| `scripts/functional-api-suite.mjs` | Full HTTP surface functional suite |
| `perf/k6/` | Gate B scenarios |
| `eval/design-agent/` | Agent quality eval |
| `deploy/observability/` | Prometheus + Grafana |
| `scripts/ci-mint-token.mjs` | CI/local session mint |
| `apps/api/seeds/design_agent_eval_suite.json` | Eval cases |
| `e2e/tests/surfaces.smoke.spec.ts` | Auth / home / projects / me / editor smokes |
| `e2e/tests/functional.all.spec.ts` | All major UI shells (home navs, account, plaza, editor, share) |

## Design Agent observe / placement

See [agent-profile.md — Observe ↔ scene feedback](./agent-profile.md#observe--scene-feedback-do-not-infinite-repaint) for artboard vs viewport and anti-repaint guards.
