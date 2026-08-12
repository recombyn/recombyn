# Big-co alignment roadmap

Track monorepo / platform maturity. Detail plan discussed in engineering; this file is the live checklist.

## Phase 1 — Foundation (in progress)

- [x] Turborepo (`turbo.json`) for build / lint / typecheck / test / dev
- [x] `@repo/tsconfig`, `@repo/eslint-config`
- [x] husky + commitlint (conventional commits)
- [x] `docs/adr` + seed ADRs 0001–0003
- [x] `npm run dev:stack` (web + collab)
- [ ] Full `apps/web` `tsc --noEmit` clean (tracked as tech debt; `npm run check` = web lint + contracts typecheck)

## Phase 2 — Backend productionization

- [ ] ADR: async job boundary (Celery + SSE)
- [ ] First vertical async job
- [ ] LLM adapter ADR + thin façade
- [ ] Memory tiers (project → session → global)
- [ ] Alembic CI gate; coverage on new routes

## Phase 3 — Observability & security

- [ ] Structured logs + trace ids
- [ ] OTel traces; alerts on 5xx / queue lag
- [ ] Upload hardening + dependency audit CI
- [ ] Security process docs

## Phase 4 — CI/CD

- [ ] Unified lint→typecheck→unit→e2e→build pipeline
- [ ] Semver / CHANGELOG / Docker publish
- [ ] Tauri signed builds (separate milestone)

## Phase 5 — Stress (as needed)

- [ ] Extend k6 + canvas stress baselines; backlog from regressions
