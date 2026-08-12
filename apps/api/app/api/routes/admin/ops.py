"""Admin ops — hydrate / export DLQ list / replay / discard."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.api.deps import require_permission, audit_admin_mutation
from app.services.auth import SessionUser
from app.services.job_store import (
    export_dlq_depth,
    get_job,
    hydrate_dlq_depth,
    list_export_dlq,
    list_hydrate_dlq,
    normalize_trace_id,
    remove_export_dlq_job,
    remove_hydrate_dlq_job,
    save_job,
)

router = APIRouter(prefix="/ops", tags=["admin-ops"])
_log = logging.getLogger(__name__)
_KIND = "hydrate"
_EXPORT_KIND = "export"


class DlqReplayIn(BaseModel):
    jobId: str = Field(min_length=1, max_length=64)


def _dlq_entry_for_job(job_id: str) -> dict[str, Any] | None:
    for row in list_hydrate_dlq(limit=500):
        if str(row.get("job_id") or "") == job_id:
            return row
    return None


def _rebuild_job_from_dlq(job_id: str, entry: dict[str, Any]) -> dict[str, Any]:
    ops = entry.get("ops") if isinstance(entry.get("ops"), list) else []
    if not ops:
        raise HTTPException(
            status_code=409,
            detail="Job payload expired and DLQ entry has no ops snapshot — cannot replay",
        )
    trace_id = normalize_trace_id(str(entry.get("trace_id") or "") or None)
    payload = {
        "job_id": job_id,
        "kind": _KIND,
        "status": "queued",
        "progress": 0,
        "ops": ops,
        "limit": int(entry.get("limit") or 6),
        "policy": str(entry.get("policy") or "auto"),
        "rules": entry.get("rules") if isinstance(entry.get("rules"), dict) else {},
        "result": None,
        "error": None,
        "trace_id": trace_id,
        "replayed_from_dlq": True,
    }
    save_job(job_id, payload, kind=_KIND)
    return payload


@router.get("/hydrate-dlq")
def admin_list_hydrate_dlq(
    _admin: SessionUser = Depends(require_permission("admin:metrics:read")),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    try:
        items = list_hydrate_dlq(limit=limit)
        depth = hydrate_dlq_depth()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"DLQ unavailable: {exc}") from exc
    return {"items": items, "depth": depth}


@router.post("/hydrate-dlq/replay")
def admin_replay_hydrate_dlq(
    body: DlqReplayIn,
    request: Request,
    admin: SessionUser = Depends(require_permission("admin:design:write")),
) -> dict[str, Any]:
    job_id = body.jobId.strip()
    entry = _dlq_entry_for_job(job_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Job not found in hydrate DLQ")

    try:
        job = get_job(job_id, kind=_KIND)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Job store unavailable: {exc}") from exc

    if job is None:
        job = _rebuild_job_from_dlq(job_id, entry)
    else:
        save_job(
            job_id,
            {
                **job,
                "status": "queued",
                "progress": 0,
                "error": None,
                "result": None,
                "replayed_from_dlq": True,
            },
            kind=_KIND,
        )

    try:
        from worker.tasks import run_image_hydrate_job

        run_image_hydrate_job.delay(job_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail=f"Job queue unavailable (start Redis + worker). {exc}",
        ) from exc

    removed = remove_hydrate_dlq_job(job_id)
    try:
        from app.core.metrics import observe_hydrate_job

        observe_hydrate_job("enqueued")
    except Exception:
        pass

    audit_admin_mutation(
        actor=admin,
        action="ops.hydrate_dlq.replay",
        resource="hydrate_dlq",
        resource_id=job_id,
        trace_id=getattr(request.state, "trace_id", None),
    )
    _log.info(
        "hydrate_dlq event=replay job_id=%s removed=%s actor=%s",
        job_id,
        removed,
        getattr(admin, "id", ""),
    )
    return {
        "jobId": job_id,
        "status": "queued",
        "removedFromDlq": removed,
        "traceId": str((job or {}).get("trace_id") or entry.get("trace_id") or "")
        or None,
    }


@router.delete("/hydrate-dlq/{job_id}")
def admin_discard_hydrate_dlq(
    job_id: str,
    request: Request,
    admin: SessionUser = Depends(require_permission("admin:design:write")),
) -> dict[str, Any]:
    jid = str(job_id or "").strip()
    if not jid:
        raise HTTPException(status_code=400, detail="job_id required")
    try:
        removed = remove_hydrate_dlq_job(jid)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"DLQ unavailable: {exc}") from exc
    if removed <= 0:
        raise HTTPException(status_code=404, detail="Job not found in hydrate DLQ")
    audit_admin_mutation(
        actor=admin,
        action="ops.hydrate_dlq.discard",
        resource="hydrate_dlq",
        resource_id=jid,
        trace_id=getattr(request.state, "trace_id", None),
    )
    return {"jobId": jid, "removedFromDlq": removed}


def _export_dlq_entry_for_job(job_id: str) -> dict[str, Any] | None:
    for row in list_export_dlq(limit=500):
        if str(row.get("job_id") or "") == job_id:
            return row
    return None


def _rebuild_export_job_from_dlq(job_id: str, entry: dict[str, Any]) -> dict[str, Any]:
    project_id = str(entry.get("project_id") or "").strip()
    user_id = str(entry.get("user_id") or "").strip()
    if not project_id or not user_id:
        raise HTTPException(
            status_code=409,
            detail="DLQ entry missing project_id/user_id — cannot replay",
        )
    fmt = str(entry.get("format") or "png").strip().lower()
    if fmt not in ("png", "pdf"):
        fmt = "png"
    frame_id = str(entry.get("frame_id") or "").strip() or None
    trace_id = normalize_trace_id(str(entry.get("trace_id") or "") or None)
    payload = {
        "job_id": job_id,
        "kind": _EXPORT_KIND,
        "status": "queued",
        "progress": 0,
        "project_id": project_id,
        "format": fmt,
        "frame_id": frame_id,
        "user_id": user_id,
        "result": None,
        "error": None,
        "trace_id": trace_id,
        "replayed_from_dlq": True,
    }
    save_job(job_id, payload, kind=_EXPORT_KIND)
    return payload


@router.get("/export-dlq")
def admin_list_export_dlq(
    _admin: SessionUser = Depends(require_permission("admin:metrics:read")),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    try:
        items = list_export_dlq(limit=limit)
        depth = export_dlq_depth()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"DLQ unavailable: {exc}") from exc
    return {"items": items, "depth": depth}


@router.post("/export-dlq/replay")
def admin_replay_export_dlq(
    body: DlqReplayIn,
    request: Request,
    admin: SessionUser = Depends(require_permission("admin:design:write")),
) -> dict[str, Any]:
    job_id = body.jobId.strip()
    entry = _export_dlq_entry_for_job(job_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Job not found in export DLQ")

    try:
        job = get_job(job_id, kind=_EXPORT_KIND)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Job store unavailable: {exc}") from exc

    if job is None:
        job = _rebuild_export_job_from_dlq(job_id, entry)
    else:
        save_job(
            job_id,
            {
                **job,
                "status": "queued",
                "progress": 0,
                "error": None,
                "result": None,
                "replayed_from_dlq": True,
            },
            kind=_EXPORT_KIND,
        )

    try:
        from worker.tasks import run_design_export_job

        run_design_export_job.delay(job_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail=f"Job queue unavailable (start Redis + worker). {exc}",
        ) from exc

    removed = remove_export_dlq_job(job_id)
    try:
        from app.core.metrics import observe_export_job

        observe_export_job("enqueued")
    except Exception:
        pass

    audit_admin_mutation(
        actor=admin,
        action="ops.export_dlq.replay",
        resource="export_dlq",
        resource_id=job_id,
        trace_id=getattr(request.state, "trace_id", None),
    )
    _log.info(
        "export_dlq event=replay job_id=%s removed=%s actor=%s",
        job_id,
        removed,
        getattr(admin, "id", ""),
    )
    return {
        "jobId": job_id,
        "status": "queued",
        "removedFromDlq": removed,
        "traceId": str((job or {}).get("trace_id") or entry.get("trace_id") or "")
        or None,
    }


@router.delete("/export-dlq/{job_id}")
def admin_discard_export_dlq(
    job_id: str,
    request: Request,
    admin: SessionUser = Depends(require_permission("admin:design:write")),
) -> dict[str, Any]:
    jid = str(job_id or "").strip()
    if not jid:
        raise HTTPException(status_code=400, detail="job_id required")
    try:
        removed = remove_export_dlq_job(jid)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"DLQ unavailable: {exc}") from exc
    if removed <= 0:
        raise HTTPException(status_code=404, detail="Job not found in export DLQ")
    audit_admin_mutation(
        actor=admin,
        action="ops.export_dlq.discard",
        resource="export_dlq",
        resource_id=jid,
        trace_id=getattr(request.state, "trace_id", None),
    )
    return {"jobId": jid, "removedFromDlq": removed}
