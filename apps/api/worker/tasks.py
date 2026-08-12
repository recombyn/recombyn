"""Celery tasks for async import + design hydrate."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from app.services.job_store import get_job, update_job
from app.services.pipeline import run_import
from worker.celery_app import celery

_HYDRATE_KIND = "hydrate"


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


@celery.task(name="worker.tasks.run_image_hydrate_job", bind=True)
def run_image_hydrate_job(self, job_id: str) -> dict:
    """Fill create_image genPrompt ops via image providers (ADR 0005)."""
    job = get_job(job_id, kind=_HYDRATE_KIND)
    if not job:
        return {"job_id": job_id, "status": "failed", "error": "job_not_found"}

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
        return {"job_id": job_id, "status": "done", "filled": filled}
    except Exception as exc:  # noqa: BLE001
        update_job(
            job_id,
            kind=_HYDRATE_KIND,
            status="failed",
            progress=100,
            error=str(exc),
        )
        return {"job_id": job_id, "status": "failed", "error": str(exc)}


@celery.task(name="worker.tasks.run_db_backup_job")
def run_db_backup_job(reason: str = "celery") -> dict:
    """Periodic DB backup (SQLite snapshot or MySQL/Postgres dump hint)."""
    from app.services.db.backup import run_db_backup

    return run_db_backup(reason=reason or "celery")
