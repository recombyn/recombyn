# ADR 0011: OpenTelemetry SDK (optional)

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

ADR 0007 shipped app-level `trace_id` + JSON logs for hydrate correlation. Cross-service spans (API ↔ collab ↔ worker) and collector export need a real OTel SDK without forcing every self-host install to pull exporters.

## Decision

1. **Optional extra** `pip install -e '.[otel]'` — API FastAPI + httpx instrumentation.
2. **Enable when** `OTEL_ENABLED=true` **or** `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Default remains off (no console spam / no deps required).
3. **Export:** OTLP/HTTP when endpoint set; otherwise ConsoleSpanExporter for local DX.
4. **Correlation bridge:** HTTP middleware prefers the active OTel span trace id for `X-Trace-Id` when a valid span exists; otherwise keeps ADR 0007 mint/header behavior.
5. **Service name:** `OTEL_SERVICE_NAME` / `otel_service_name` (default `recombyn-api`).

## Consequences

### Positive

- Collector-ready spans without rewriting hydrate job correlation.
- Self-host stays light unless ops opts in.

### Negative / trade-offs

- Worker / collab process instrumentation is a follow-up (same env contract).
- Instrumentator versions track OTel prereleases carefully.

## Alternatives considered

1. **Always-on OTel in base deps** — rejected (install + noise cost).
2. **Only W3C `traceparent` without SDK** — incomplete vs collectors.

## References

- [ADR 0007](./0007-correlation-structured-logs.md)
- `apps/api/app/core/metrics.py` (`setup_otel`)
- [Roadmap Phase 3](../roadmap/bigco-alignment.md)
