"""Redis-backed async job status store (import, hydrate, …)."""

from __future__ import annotations

import json
import uuid
from typing import Any

import redis

from app.core.config import settings

_DEFAULT_KIND = "import"


def new_trace_id() -> str:
    return uuid.uuid4().hex


def normalize_trace_id(raw: str | None) -> str:
    """Safe correlation id for logs / job payloads (ADR 0007)."""
    t = str(raw or "").strip()
    if not t:
        return new_trace_id()
    cleaned = "".join(ch if ch.isalnum() or ch in "-_" else "" for ch in t)[:64]
    return cleaned or new_trace_id()


def _normalize_kind(kind: str | None) -> str:
    k = str(kind or _DEFAULT_KIND).strip().lower() or _DEFAULT_KIND
    # Keep Redis key segment safe.
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in k)[:32]


def job_key(job_id: str, *, kind: str = _DEFAULT_KIND) -> str:
    return f"{_normalize_kind(kind)}_job:{job_id}"


def _client() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def save_job(job_id: str, payload: dict[str, Any], *, kind: str = _DEFAULT_KIND) -> None:
    client = _client()
    client.set(
        job_key(job_id, kind=kind),
        json.dumps(payload, ensure_ascii=False),
        ex=settings.job_ttl_seconds,
    )


def get_job(job_id: str, *, kind: str = _DEFAULT_KIND) -> dict[str, Any] | None:
    raw = _client().get(job_key(job_id, kind=kind))
    if not raw:
        return None
    return json.loads(raw)


def update_job(job_id: str, *, kind: str = _DEFAULT_KIND, **fields: Any) -> dict[str, Any] | None:
    current = get_job(job_id, kind=kind)
    if current is None:
        return None
    current.update(fields)
    save_job(job_id, current, kind=kind)
    return current


_DLQ_KEY = "recombyn:dlq:hydrate"
_DLQ_MAX = 500


def push_hydrate_dlq(entry: dict[str, Any]) -> None:
    """Append a terminal hydrate failure for ops replay (ADR 0005 DLQ).

    Best-effort: never raise — failure recording must not mask the original error
    (and unit tests often run without Redis).
    """
    try:
        client = _client()
        payload = json.dumps(entry, ensure_ascii=False)
        client.lpush(_DLQ_KEY, payload)
        client.ltrim(_DLQ_KEY, 0, _DLQ_MAX - 1)
        # Keep list around at least as long as jobs.
        client.expire(_DLQ_KEY, max(settings.job_ttl_seconds, 7 * 86400))
    except Exception:
        import logging

        logging.getLogger(__name__).warning(
            "hydrate DLQ push failed job_id=%s",
            entry.get("job_id"),
            exc_info=True,
        )


def list_hydrate_dlq(*, limit: int = 50) -> list[dict[str, Any]]:
    raw = _client().lrange(_DLQ_KEY, 0, max(0, limit - 1))
    out: list[dict[str, Any]] = []
    for item in raw or []:
        try:
            out.append(json.loads(item))
        except Exception:
            out.append({"_raw": str(item)[:200]})
    return out


def hydrate_dlq_depth() -> int:
    """Best-effort Redis LLEN for Grafana queue-depth panels."""
    try:
        return int(_client().llen(_DLQ_KEY) or 0)
    except Exception:
        return 0


def remove_hydrate_dlq_job(job_id: str) -> int:
    """Remove all DLQ rows matching job_id. Returns how many list entries dropped."""
    jid = str(job_id or "").strip()
    if not jid:
        return 0
    client = _client()
    raw = client.lrange(_DLQ_KEY, 0, -1) or []
    removed = 0
    for item in raw:
        try:
            entry = json.loads(item)
        except Exception:
            continue
        if str(entry.get("job_id") or "") != jid:
            continue
        removed += int(client.lrem(_DLQ_KEY, 0, item) or 0)
    return removed
