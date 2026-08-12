# Architecture Decision Records (ADR)

Cross-cutting or irreversible technical choices live here. Product feature notes stay in `docs/*.md`.

## When to write an ADR

- New shared package / monorepo boundary change
- Persistence or collab protocol change (DB, Yjs, Redis)
- Async job / LLM provider abstraction
- Security model (authz, secrets, upload)
- Anything that would surprise a new engineer six months later

## Process

1. Copy [`0000-template.md`](./0000-template.md) → `NNNN-short-slug.md` (next number).
2. Open a PR with the ADR **before or with** the implementing code.
3. Status: `Proposed` → `Accepted` (on merge) → `Superseded by NNNN` if replaced.

## Index

| ID | Title | Status |
|----|-------|--------|
| [0001](./0001-monorepo-boundaries.md) | Monorepo app/package boundaries | Accepted |
| [0002](./0002-canvas-rcb-runtime.md) | Custom RCB canvas runtime | Accepted |
| [0003](./0003-yjs-collab-service.md) | Yjs collab as a separate Node service | Accepted |
| [0004](./0004-modular-monolith-first.md) | Modular monolith first; defer microservices | Accepted |
| [0005](./0005-async-job-boundary.md) | Async job boundary (Celery + Redis poll) | Accepted |
| [0006](./0006-llm-facade-memory-tiers.md) | In-process LLM 中台 + memory tiers | Accepted |
| [0007](./0007-correlation-structured-logs.md) | Correlation + structured logs (OTel later) | Accepted |
| [0008](./0008-upload-content-validation.md) | Upload content validation + optional AV | Accepted |
| [0009](./0009-unified-ci-rollback.md) | Unified CI gate + Docker tag rollback | Accepted |
| [0010](./0010-desktop-signing.md) | Desktop (Tauri) release signing | Accepted |
