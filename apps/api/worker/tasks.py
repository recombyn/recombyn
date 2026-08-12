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
_EXPORT_KIND = "export"
_JOB_TRANSIENT = (ConnectionError, TimeoutError, OSError)


def _fail_job_to_dlq(
    *,
    kind: str,
    job_id: str,
    error: str,
    retries: int,
    extra: dict[str, Any],
) -> dict:
    from app.core.metrics import observe_dlq, observe_job
    from app.services.job_store import push_dlq

    update_job(job_id, kind=kind, status="failed", progress=100, error=error)
    push_dlq(kind, {"job_id": job_id, "error": error, "retries": retries, **extra})
    observe_job(kind, "failed")
    observe_job(kind, "dlq")
    observe_dlq(kind)
    trace_id = str(extra.get("trace_id") or "")
    _log.error(
        "%s_job event=dlq job_id=%s trace_id=%s err=%s",
        kind,
        job_id,
        trace_id,
        error,
        extra={"job_id": job_id, "trace_id": trace_id, "event": "dlq"},
    )
    return {"job_id": job_id, "status": "failed", "error": error, "dlq": True}


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
    autoretry_for=_JOB_TRANSIENT,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    retry_kwargs={"max_retries": 2},
)
def run_image_hydrate_job(self, job_id: str) -> dict:
    """Fill create_image genPrompt ops via image providers (ADR 0005 / 0007)."""
    from app.core.metrics import observe_job

    def _fail_to_dlq(
        error: str,
        *,
        trace_id: str = "",
        ops: list | None = None,
        limit: int = 6,
        policy: str = "auto",
        rules: dict | None = None,
    ) -> dict:
        return _fail_job_to_dlq(
            kind=_HYDRATE_KIND,
            job_id=job_id,
            error=error,
            retries=int(getattr(self.request, "retries", 0) or 0),
            extra={
                "trace_id": trace_id,
                "ops": ops if isinstance(ops, list) else [],
                "limit": int(limit or 6),
                "policy": str(policy or "auto"),
                "rules": rules if isinstance(rules, dict) else {},
            },
        )

    job = get_job(job_id, kind=_HYDRATE_KIND)
    if not job:
        observe_job(_HYDRATE_KIND, "failed")
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
        observe_job(_HYDRATE_KIND, "done")
        _log.info(
            "hydrate_job event=done job_id=%s trace_id=%s filled=%s",
            job_id,
            trace_id,
            filled,
            extra={"job_id": job_id, "trace_id": trace_id, "event": "done"},
        )
        return {"job_id": job_id, "status": "done", "filled": filled}
    except _JOB_TRANSIENT as exc:
        retries = int(getattr(self.request, "retries", 0) or 0)
        max_retries = int(getattr(self, "max_retries", 2) or 2)
        if retries >= max_retries:
            return _fail_to_dlq(
                f"retries exhausted: {exc}",
                trace_id=trace_id,
                ops=ops,
                limit=limit,
                policy=policy,
                rules=rules,
            )
        observe_job(_HYDRATE_KIND, "retry")
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
        return _fail_to_dlq(
            str(exc),
            trace_id=trace_id,
            ops=ops,
            limit=limit,
            policy=policy,
            rules=rules,
        )


_EXPORT_KIND = "export"


@celery.task(
    name="worker.tasks.run_design_export_job",
    bind=True,
    autoretry_for=_JOB_TRANSIENT,
    retry_backoff=True,
    retry_backoff_max=60,
    retry_jitter=True,
    retry_kwargs={"max_retries": 2},
)
def run_design_export_job(self, job_id: str) -> dict:
    """Rasterize project artboards to PNG/PDF (ADR 0005 export vertical)."""
    from app.core.metrics import observe_job
    from app.services.design.export_render import render_and_store_export
    from app.services.projects import get_project

    def _fail_to_dlq(error: str, *, trace_id: str = "") -> dict:
        job_now = get_job(job_id, kind=_EXPORT_KIND) or {}
        return _fail_job_to_dlq(
            kind=_EXPORT_KIND,
            job_id=job_id,
            error=error,
            retries=int(getattr(self.request, "retries", 0) or 0),
            extra={
                "trace_id": trace_id,
                "project_id": job_now.get("project_id"),
                "format": job_now.get("format"),
                "frame_id": job_now.get("frame_id"),
                "user_id": job_now.get("user_id"),
            },
        )

    job = get_job(job_id, kind=_EXPORT_KIND)
    if not job:
        observe_job(_EXPORT_KIND, "failed")
        return {"job_id": job_id, "status": "failed", "error": "job_not_found"}

    trace_id = str(job.get("trace_id") or "")
    user_id = str(job.get("user_id") or "")
    project_id = str(job.get("project_id") or "")
    fmt = str(job.get("format") or "png")
    frame_id = str(job.get("frame_id") or "") or None
    update_job(job_id, kind=_EXPORT_KIND, status="processing", progress=10, error=None)

    try:
        project = get_project(user_id, project_id)
        if not project:
            return _fail_to_dlq("project_not_found", trace_id=trace_id)
        document = project.get("document")
        if not isinstance(document, dict):
            return _fail_to_dlq("document_missing", trace_id=trace_id)
        update_job(job_id, kind=_EXPORT_KIND, progress=40)
        result = render_and_store_export(
            document=document,
            user_id=user_id,
            job_id=job_id,
            fmt=fmt,
            frame_id=frame_id,
        )
        update_job(
            job_id,
            kind=_EXPORT_KIND,
            status="done",
            progress=100,
            result=result,
            error=None,
        )
        observe_job(_EXPORT_KIND, "done")
        _log.info(
            "export_job event=done job_id=%s pages=%s format=%s",
            job_id,
            result.get("pages"),
            fmt,
            extra={"job_id": job_id, "trace_id": trace_id, "event": "done"},
        )
        return {"job_id": job_id, "status": "done", "pages": result.get("pages")}
    except _JOB_TRANSIENT as exc:
        retries = int(getattr(self.request, "retries", 0) or 0)
        max_retries = int(getattr(self, "max_retries", 2) or 2)
        if retries >= max_retries:
            return _fail_to_dlq(f"retries exhausted: {exc}", trace_id=trace_id)
        observe_job(_EXPORT_KIND, "retry")
        update_job(
            job_id,
            kind=_EXPORT_KIND,
            status="processing",
            error=f"transient retry: {exc}",
        )
        raise
    except Exception as exc:  # noqa: BLE001
        return _fail_to_dlq(str(exc), trace_id=trace_id)


@celery.task(name="worker.tasks.run_db_backup_job")
def run_db_backup_job(reason: str = "celery") -> dict:
    """Periodic DB backup (SQLite snapshot or MySQL/Postgres dump hint)."""
    from app.services.db.backup import run_db_backup

    return run_db_backup(reason=reason or "celery")
