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
