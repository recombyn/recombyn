"""Project version history — named / auto frozen document snapshots."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Literal

from app.services.db import init_schema
from app.services.projects import (
    ProjectConflictError,
    ProjectForbiddenError,
    ProjectNotFoundError,
    _can_write_project,
    _decode_document_row,
    _row_field,
    _row_thumb_custom,
    _thumbnail_urls_out,
    upsert_project,
)
from app.services.storage import delete_object, get_bytes, get_storage, put_bytes

_MAX_INLINE_BYTES = 512 * 1024
_MAX_DOC_BYTES = 12 * 1024 * 1024
_MAX_NAMED = 50
_MAX_AUTO = 30

VersionKind = Literal["named", "auto"]


class ProjectVersionError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code
        self.message = message or code


class ProjectVersionNotFoundError(ProjectVersionError):
    def __init__(self, version_id: str = ""):
        super().__init__("version_not_found", "Version not found")
        self.version_id = version_id


def _freeze_document(document: dict[str, Any]) -> dict[str, Any]:
    try:
        snapshot = json.loads(json.dumps(document, ensure_ascii=False))
    except (TypeError, ValueError) as err:
        raise ProjectVersionError("invalid_document", "document must be JSON-serializable") from err
    if not isinstance(snapshot, dict):
        raise ProjectVersionError("invalid_document", "document must be an object")
    return snapshot


def _clamp_name(name: str | None, *, fallback: str) -> str:
    text = (name or "").strip() or fallback
    return text[:120] if len(text) > 120 else text


def _clamp_note(note: str | None) -> str | None:
    if note is None:
        return None
    text = str(note).strip()
    if not text:
        return None
    return text[:2000]


def _encode_version_document(
    user_id: str,
    project_id: str,
    version_id: str,
    document: dict[str, Any],
) -> tuple[str | None, str | None]:
    raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    encoded = raw.encode("utf-8")
    if len(encoded) > _MAX_DOC_BYTES:
        raise ProjectVersionError("document_too_large", "Document is too large")
    storage = get_storage()
    if storage.enabled_remote() and len(encoded) > _MAX_INLINE_BYTES:
        doc_key = f"projects/{user_id}/{project_id}/versions/{version_id}/document.json"
        put_bytes(doc_key, encoded, content_type="application/json")
        return None, doc_key
    return raw, None


def _decode_version_row(row: Any) -> dict[str, Any] | None:
    doc_json = _row_field(row, "document_json")
    doc_key = _row_field(row, "document_key")
    if doc_json:
        try:
            doc = json.loads(doc_json)
            return doc if isinstance(doc, dict) else None
        except json.JSONDecodeError:
            return None
    if doc_key:
        raw = get_bytes(doc_key)
        if raw:
            try:
                doc = json.loads(raw.decode("utf-8"))
                return doc if isinstance(doc, dict) else None
            except (json.JSONDecodeError, UnicodeDecodeError):
                return None
    return None


def _version_meta(row: Any) -> dict[str, Any]:
    return {
        "id": row.id,
        "projectId": row.project_id,
        "name": row.name or "",
        "note": row.note,
        "kind": row.kind if row.kind in ("named", "auto") else "named",
        "sourceRevision": int(row.source_revision or 0),
        "thumbnailUrl": _thumbnail_urls_out(_row_field(row, "thumbnail_key")),
        "createdAt": int(float(row.created_at or 0) * 1000),
    }


def _require_project_access(*, user_id: str, project_id: str, write: bool) -> Any:
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    pid = (project_id or "").strip()
    if not pid:
        raise ProjectNotFoundError("")
    with Session(engine) as session:
        row = crud.get_project_accessible(session=session, user_id=user_id, project_id=pid)
        if not row:
            raise ProjectNotFoundError(pid)
        if write and not _can_write_project(user_id=user_id, row=row):
            raise ProjectForbiddenError(pid)
        # Detach fields we need after session closes.
        return {
            "id": row.id,
            "user_id": row.user_id,
            "org_id": getattr(row, "org_id", None),
            "name": row.name,
            "revision": int(row.revision or 1),
            "updated_at": float(row.updated_at or 0),
            "thumbnail_key": row.thumbnail_key,
            "thumbnail_custom": _row_thumb_custom(row),
            "document": _decode_document_row(row),
        }


def _count_kind(session: Any, project_id: str, kind: str) -> int:
    from sqlmodel import select

    from app.models import ProjectVersion

    rows = session.exec(
        select(ProjectVersion.id).where(
            ProjectVersion.project_id == project_id,
            ProjectVersion.kind == kind,
        )
    ).all()
    return len(list(rows))


def _delete_version_row(session: Any, row: Any) -> None:
    key = _row_field(row, "document_key")
    if key:
        delete_object(str(key))
    session.delete(row)


def _prune_auto(session: Any, project_id: str) -> None:
    from sqlmodel import select

    from app.models import ProjectVersion

    while _count_kind(session, project_id, "auto") > _MAX_AUTO:
        oldest = session.exec(
            select(ProjectVersion)
            .where(
                ProjectVersion.project_id == project_id,
                ProjectVersion.kind == "auto",
            )
            .order_by(ProjectVersion.created_at.asc())
            .limit(1)
        ).first()
        if not oldest:
            break
        _delete_version_row(session, oldest)
        session.commit()


def create_version(
    user_id: str,
    project_id: str,
    *,
    name: str | None = None,
    note: str | None = None,
    kind: VersionKind = "named",
    document: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Freeze current (or provided) project document into a version row."""
    from sqlmodel import Session

    from app.core.db import engine
    from app.models import ProjectVersion

    init_schema()
    if kind not in ("named", "auto"):
        raise ProjectVersionError("invalid_kind", "kind must be named or auto")

    project = _require_project_access(user_id=user_id, project_id=project_id, write=True)
    pid = str(project["id"])
    owner_id = str(project["user_id"] or user_id)
    source_rev = int(project["revision"] or 1)

    if document is not None:
        snap = _freeze_document(document)
    else:
        live = project.get("document")
        if not isinstance(live, dict):
            raise ProjectVersionError("empty_document", "Project has no document to snapshot")
        snap = _freeze_document(live)

    default_name = "Saved version" if kind == "named" else "Auto save"
    version_id = f"pv_{uuid.uuid4().hex[:16]}"
    doc_json, doc_key = _encode_version_document(owner_id, pid, version_id, snap)
    now = time.time()

    with Session(engine) as session:
        if kind == "named" and _count_kind(session, pid, "named") >= _MAX_NAMED:
            raise ProjectVersionError(
                "named_limit",
                f"At most {_MAX_NAMED} named versions per project",
            )

        row = ProjectVersion(
            id=version_id,
            project_id=pid,
            user_id=owner_id,
            name=_clamp_name(name, fallback=default_name),
            note=_clamp_note(note),
            kind=kind,
            source_revision=source_rev,
            document_json=doc_json,
            document_key=doc_key,
            thumbnail_key=project.get("thumbnail_key"),
            created_at=now,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        if kind == "auto":
            _prune_auto(session, pid)
            session.refresh(row)
        return _version_meta(row)


def list_versions(
    user_id: str,
    project_id: str,
    *,
    kind: str | None = None,
    page: int = 1,
    page_size: int = 40,
) -> dict[str, Any]:
    from sqlmodel import Session, select

    from app.core.db import engine
    from app.models import ProjectVersion

    init_schema()
    project = _require_project_access(user_id=user_id, project_id=project_id, write=False)
    pid = str(project["id"])
    page_n = max(1, int(page or 1))
    size_n = max(1, min(100, int(page_size or 40)))
    offset = (page_n - 1) * size_n

    with Session(engine) as session:
        stmt = select(ProjectVersion).where(ProjectVersion.project_id == pid)
        if kind in ("named", "auto"):
            stmt = stmt.where(ProjectVersion.kind == kind)
        stmt = stmt.order_by(ProjectVersion.created_at.desc())
        rows = list(session.exec(stmt).all())
        total = len(rows)
        page_rows = rows[offset : offset + size_n]
        return {
            "items": [_version_meta(r) for r in page_rows],
            "page": page_n,
            "pageSize": size_n,
            "total": total,
            "hasMore": offset + len(page_rows) < total,
        }


def get_version(
    user_id: str,
    project_id: str,
    version_id: str,
    *,
    include_document: bool = True,
) -> dict[str, Any]:
    from sqlmodel import Session

    from app.core.db import engine
    from app.models import ProjectVersion

    init_schema()
    project = _require_project_access(user_id=user_id, project_id=project_id, write=False)
    pid = str(project["id"])
    vid = (version_id or "").strip()
    if not vid:
        raise ProjectVersionNotFoundError("")

    with Session(engine) as session:
        row = session.get(ProjectVersion, vid)
        if not row or str(row.project_id) != pid:
            raise ProjectVersionNotFoundError(vid)
        out = _version_meta(row)
        if include_document:
            out["document"] = _decode_version_row(row)
        return out


def update_version(
    user_id: str,
    project_id: str,
    version_id: str,
    *,
    name: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    from sqlmodel import Session

    from app.core.db import engine
    from app.models import ProjectVersion

    init_schema()
    _require_project_access(user_id=user_id, project_id=project_id, write=True)
    pid = (project_id or "").strip()
    vid = (version_id or "").strip()
    if not vid:
        raise ProjectVersionNotFoundError("")

    with Session(engine) as session:
        row = session.get(ProjectVersion, vid)
        if not row or str(row.project_id) != pid:
            raise ProjectVersionNotFoundError(vid)
        if name is not None:
            row.name = _clamp_name(name, fallback=row.name or "Saved version")
        if note is not None:
            row.note = _clamp_note(note)
        session.add(row)
        session.commit()
        session.refresh(row)
        return _version_meta(row)


def delete_version(user_id: str, project_id: str, version_id: str) -> bool:
    from sqlmodel import Session

    from app.core.db import engine
    from app.models import ProjectVersion

    init_schema()
    _require_project_access(user_id=user_id, project_id=project_id, write=True)
    pid = (project_id or "").strip()
    vid = (version_id or "").strip()
    if not vid:
        raise ProjectVersionNotFoundError("")

    with Session(engine) as session:
        row = session.get(ProjectVersion, vid)
        if not row or str(row.project_id) != pid:
            raise ProjectVersionNotFoundError(vid)
        _delete_version_row(session, row)
        session.commit()
        return True


def restore_version(
    user_id: str,
    project_id: str,
    version_id: str,
    *,
    base_revision: int | None,
    create_backup: bool = True,
) -> dict[str, Any]:
    """Write a version document onto the live project under optimistic lock."""
    init_schema()
    project = _require_project_access(user_id=user_id, project_id=project_id, write=True)
    pid = str(project["id"])
    snap = get_version(user_id, pid, version_id, include_document=True)
    document = snap.get("document")
    if not isinstance(document, dict):
        raise ProjectVersionError("empty_document", "Version has no document")

    backup: dict[str, Any] | None = None
    if create_backup and isinstance(project.get("document"), dict):
        backup = create_version(
            user_id,
            pid,
            name="Before restore",
            kind="auto",
            document=project["document"],
        )

    try:
        project_out = upsert_project(
            user_id,
            project_id=pid,
            name=str(project.get("name") or "Untitled"),
            document=document,
            base_revision=base_revision,
            thumbnail_custom=bool(project.get("thumbnail_custom")),
        )
    except ProjectConflictError:
        raise

    return {
        "project": project_out,
        "document": document,
        "restoredVersion": {k: snap[k] for k in snap if k != "document"},
        "backupVersion": backup,
    }
