"""Redis-backed async job status store (import, hydrate, …)."""

from __future__ import annotations

import json
from typing import Any

import redis

from app.core.config import settings

_DEFAULT_KIND = "import"


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
