"""Celery tasks for async import + design hydrate."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from app.services.job_store import get_job, update_job
from app.services.pipeline import run_import
from worker.celery_app import celery

_log = logging.getLogger(__name__)

_HYDRATE_KIND = "hydrate"
_HYDRATE_TRANSIENT = (ConnectionError, TimeoutError, OSError)


@celery.task(name="worker.tasks.run_import_job", bind=True)
def run_import_job(self, job_id: str, source_type: str, file_path: str) -> dict:
    update_job(job_id, status="processing", progress=15, error=None)
    try:
        update_job(job_id, progress=35)
        result = run_import(source_type, Path(file_path), job_id=job_id)  # type: ignore[arg-type]
        update_job(job_id, progress=90)
        status = result.get("status") or "done"
        update_job(
            job_id,
            status=status,
            progress=100,
            document=result.get("document"),
            meta=result.get("meta"),
            error=result.get("error"),
        )
        return {"job_id": job_id, "status": status, "error": result.get("error")}
    except Exception as exc:  # noqa: BLE001 — persist failure for client poll
        update_job(job_id, status="failed", progress=100, error=str(exc))
        return {"job_id": job_id, "status": "failed", "error": str(exc)}


@celery.task(
    name="worker.tasks.run_image_hydrate_job",
    bind=True,
    autoretry_for=_HYDRATE_TRANSIENT,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    retry_kwargs={"max_retries": 2},
)
def run_image_hydrate_job(self, job_id: str) -> dict:
    """Fill create_image genPrompt ops via image providers (ADR 0005 / 0007)."""
    from app.core.metrics import observe_hydrate_dlq, observe_hydrate_job
    from app.services.job_store import push_hydrate_dlq

    def _fail_to_dlq(error: str, *, trace_id: str = "") -> dict:
        update_job(
            job_id,
            kind=_HYDRATE_KIND,
            status="failed",
            progress=100,
            error=error,
        )
        push_hydrate_dlq(
            {
                "job_id": job_id,
                "trace_id": trace_id,
                "error": error,
                "retries": int(getattr(self.request, "retries", 0) or 0),
            }
        )
        observe_hydrate_job("failed")
        observe_hydrate_job("dlq")
        observe_hydrate_dlq()
        _log.error(
            "hydrate_job event=dlq job_id=%s trace_id=%s err=%s",
            job_id,
            trace_id,
            error,
            extra={"job_id": job_id, "trace_id": trace_id, "event": "dlq"},
        )
        return {"job_id": job_id, "status": "failed", "error": error, "dlq": True}

    job = get_job(job_id, kind=_HYDRATE_KIND)
    if not job:
        observe_hydrate_job("failed")
        _log.warning(
            "hydrate_job event=failed job_id=%s error=job_not_found",
            job_id,
            extra={"job_id": job_id, "event": "failed"},
        )
        return {"job_id": job_id, "status": "failed", "error": "job_not_found"}

    trace_id = str(job.get("trace_id") or "")
    _log.info(
        "hydrate_job event=start job_id=%s trace_id=%s",
        job_id,
        trace_id,
        extra={"job_id": job_id, "trace_id": trace_id, "event": "start"},
    )
    update_job(job_id, kind=_HYDRATE_KIND, status="processing", progress=10, error=None)
    ops = job.get("ops") if isinstance(job.get("ops"), list) else []
    limit = int(job.get("limit") or 6)
    policy = str(job.get("policy") or "auto")
    rules = job.get("rules") if isinstance(job.get("rules"), dict) else {}

    try:
        update_job(job_id, kind=_HYDRATE_KIND, progress=35)
        from app.services.design.ops.image_hydrate import _hydrate_tool_ops_images

        hydrated, filled = asyncio.run(
            _hydrate_tool_ops_images(
                list(ops),
                limit=max(1, min(24, limit)),
                policy=policy,
                rules={str(k): str(v) for k, v in rules.items()},
            )
        )
        result: dict[str, Any] = {
            "ops": hydrated,
            "filled": int(filled),
            "requested": len(ops),
        }
        update_job(
            job_id,
            kind=_HYDRATE_KIND,
            status="done",
            progress=100,
            result=result,
            error=None,
        )
        observe_hydrate_job("done")
        _log.info(
            "hydrate_job event=done job_id=%s trace_id=%s filled=%s",
            job_id,
            trace_id,
            filled,
            extra={"job_id": job_id, "trace_id": trace_id, "event": "done"},
        )
        return {"job_id": job_id, "status": "done", "filled": filled}
    except _HYDRATE_TRANSIENT as exc:
        retries = int(getattr(self.request, "retries", 0) or 0)
        max_retries = int(getattr(self, "max_retries", 2) or 2)
        if retries >= max_retries:
            return _fail_to_dlq(f"retries exhausted: {exc}", trace_id=trace_id)
        observe_hydrate_job("retry")
        update_job(
            job_id,
            kind=_HYDRATE_KIND,
            status="processing",
            error=f"transient retry: {exc}",
        )
        _log.warning(
            "hydrate_job event=retry job_id=%s trace_id=%s err=%s",
            job_id,
            trace_id,
            exc,
            extra={"job_id": job_id, "trace_id": trace_id, "event": "retry"},
        )
        raise
    except Exception as exc:  # noqa: BLE001
        return _fail_to_dlq(str(exc), trace_id=trace_id)


@celery.task(name="worker.tasks.run_db_backup_job")
def run_db_backup_job(reason: str = "celery") -> dict:
    """Periodic DB backup (SQLite snapshot or MySQL/Postgres dump hint)."""
    from app.services.db.backup import run_db_backup

    return run_db_backup(reason=reason or "celery")
