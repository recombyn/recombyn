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

### Changed

- Self-host docs: Docker Compose image tag rollback procedure
- Cleared Phase 1 web `tsc` debt; `npm run typecheck:web` required in CI / `ci:gate`

## [0.1.0] — 2026-08-12

### Added

- Initial public monorepo baseline (web, API, collab, quality gates)
