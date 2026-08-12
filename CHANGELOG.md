# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
for tagged releases (`vMAJOR.MINOR.PATCH`).

## [Unreleased]

### Added

- Phase 1–3 foundation: Turborepo / ADR / async hydrate jobs / LLM façade / correlation logs / upload magic sniff
- Unified CI umbrella (`.github/workflows/ci.yml`) — lint, contracts typecheck, **web `tsc`**, unit tests, web build (ADR 0009)
- GHCR publish on `v*.*.*` tags (`release-docker.yml`) + `docker-compose.ghcr.yml` pull path
- Desktop unsigned CI build (dispatch) + signing checklist (ADR 0010); stress baseline runbook
- Mock image-gen promote E2E + project `baseRevision` 412 conflict coverage (Phase 5 slice)
- Optional OpenTelemetry (`.[otel]`, ADR 0011); hydrate Redis DLQ; ClamAV compose profile; dual Yjs merge Gate B
- Phase 6: k8s starter manifests, worker/collab OTel, RBAC permissions, 5k LOD budget test, paid-gen opt-in E2E
- k8s HPA/Ingress examples; admin write audit router-wide; org_members Alembic skeleton

### Changed

- Self-host docs: Docker Compose image tag rollback procedure
- Cleared Phase 1 web `tsc` debt; `npm run typecheck:web` required in CI / `ci:gate`
- Perf k6 collab install uses `--ignore-scripts` (husky prepare no longer breaks Gate B)
- Hydrate DLQ push is best-effort (no Redis required in unit tests)

## [0.1.0] — 2026-08-12

### Added

- Initial public monorepo baseline (web, API, collab, quality gates)
