# Stress & load baselines

Phase 5 living notes. Tools already exist; this doc records **how to capture a baseline** and where artifacts land. Do not invent a second harness.

## Matrix

| Surface | Command | Artifact / truth |
|---------|---------|------------------|
| Canvas store + E2E stress | `npm run test:canvas:stress` | Console + Playwright/HTML; optional JSON under `e2e/tests/*.results.json` (local, gitignored if untracked) |
| Canvas deep / tools | `npm run test:canvas:deep` / `test:canvas:tools` | Same |
| Vitest canvas stress | `npm run test:stress --workspace=apps/web` | Vitest (also in `web-tests.yml`) |
| API k6 smoke | `npm run perf:k6:smoke` | k6 summary; CI: `perf-k6.yml` |
| API CRUD load | `PERF_TOKEN=… npm run perf:k6:api` | k6 |
| Collab WS | `COLLAB_WS_URL=ws://127.0.0.1:1234 npm run perf:k6:collab` | k6 |
| Soak | `npm run perf:k6:soak` (nightly) | `nightly-quality.yml` |
| Agent craft stress | `npm run stress:agent` | Script stdout / eval hooks |

## Recording a baseline (maintainers)

1. Use a quiet machine; note commit SHA: `git rev-parse --short HEAD`.
2. Start stack as needed (`npm run dev:stack`, `dev:api`, Redis, collab).
3. Run one row from the matrix; save the k6/Playwright summary next to the SHA in the PR or an issue comment (do not commit large result JSON by default).
4. Compare the next release against that SHA — look for p95 / error-rate / flake-rate regressions, not absolute “pass forever”.

## Intentional gaps (still)

- Paid image/video gen finish in E2E
- Dual-client collab conflict resolution under load (beyond k6 WS smoke)
- True 5k-node SvgCanvas interactive mount

See [quality-gates.md](./quality-gates.md) Gate A/B and [bigco-alignment.md](./roadmap/bigco-alignment.md) Phase 5.
