# ADR 0004: Modular monolith first (defer microservices)

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

Big-co AI canvas platforms often publish a reference topology: API gateway, identity, canvas store, asset service, AI model mid-platform, async workers, and collab — each a microservice. Recombyn already has a **Node collab process** and a **Python API** that owns auth, projects, wallet, and the Design Agent. Prematurely splitting the API would multiply ops cost without proven scale or team boundaries.

## Decision

1. **Keep a modular monolith for `apps/api`**: enforce domain folders / clear module boundaries (auth, projects, design, wallet, assets) rather than new deployables by default.
2. **Keep `apps/collab` separate** (already justified by WS fanout and token boundary) — see [ADR 0003](./0003-yjs-collab-service.md).
3. **Extract a new service only when ≥2 hold**:
   - Independent scale or failure domain (e.g. GPU render farm)
   - Separate release cadence / ownership
   - Clear data ownership that must not share the API DB transactionally
4. **AI “模型中台”** starts as an **in-process adapter layer** (provider interface + routing), not a standalone gateway service.
5. **Async work** uses Celery/Redis **workers sharing the API codebase** first; split worker images only if deploy/scaling needs diverge.

## Consequences

### Positive

- Matches current team size and OSS self-host story.
- Faster feature delivery; one schema / one migration story.
- Still aligns with big-co *domain* thinking via ADR + CODEOWNERS + tests.

### Negative / trade-offs

- A noisy Design Agent can still contend with REST latency until jobs move off-request.
- Must maintain discipline so modules do not become a ball of mud.

## Alternatives considered

1. **Split all seven services now** — rejected; ops and contract surface explode.
2. **Merge collab into API** — rejected; WS and Python workers couple poorly.

## References

- [Roadmap mapping](../roadmap/bigco-alignment.md)
- Celery settings already in `apps/api/app/core/config.py`
