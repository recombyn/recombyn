# ADR 0005: Async job boundary (Celery + Redis poll)

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

Long-running work (PDF import, image hydrate, future export/render) must not block FastAPI request workers. We already enqueue **import** via Celery + Redis job records. Design Agent image hydrate still runs inside the LangGraph / `/design/run` SSE request and can stall the stream for up to ~90s.

## Decision

1. **Queue:** Celery + Redis broker/result (existing `worker.celery_app`).
2. **Job record:** Redis JSON via `app.services.job_store` with kind prefix `{kind}_job:{id}` (import, hydrate, …), TTL `job_ttl_seconds`.
3. **Client contract (v1):** enqueue + poll (same shape as import):
   - `POST …/jobs` → `{ job_id, status: "queued" }`
   - `GET …/jobs/{id}` → `{ job_id, status, progress, result?, error? }`
   - Status: `queued | processing | done | failed`
4. **Progress streaming:** keep Design Agent SSE for interactive agent turns; **do not** invent a second SSE protocol for hydrate v1. Optional later: SSE `hydrate_progress` if poll UX is insufficient.
5. **First vertical:** `POST/GET /api/v1/design/hydrate/jobs` + `worker.tasks.run_image_hydrate_job` wrapping `_hydrate_tool_ops_images`. Design Agent `apply` / `action` call `hydrate_tool_ops_images` which **enqueues + polls** (stall → in-process fallback when no worker).
6. **Retry / metrics:** hydrate task uses Celery `autoretry_for` on transient `ConnectionError` / `TimeoutError` / `OSError` (max 2, backoff). Counter `recombyn_hydrate_jobs_total{event}` (`enqueued|done|failed|retry`). Full DLQ deferred until failure rate justifies it.
7. **Local DX:** `npm run dev:worker` starts Celery (`--pool=solo` on Windows). Settings: `design_image_hydrate_async`, `design_image_hydrate_queue_stall_sec`.

## Consequences

### Positive

- Unblocks API/agent request threads for image generation.
- Reuses proven import job pattern; low new surface area.

### Negative / trade-offs

- Requires Redis + worker process locally (document clearly).
- Poll UX is coarser than SSE until phase 2 wiring.

## Alternatives considered

1. **Only SSE for hydrate** — rejected for v1; couples FE and job lifecycle too early.
2. **In-process asyncio background tasks** — rejected for multi-worker deploy (lost on restart).
3. **Split hydrate microservice** — rejected per ADR 0004.

## References

- `apps/api/app/api/routes/import_jobs.py`
- `apps/api/worker/tasks.py`
- [Roadmap Phase 2](../roadmap/bigco-alignment.md)
