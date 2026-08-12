"""Org membership store — skeleton for multi-tenant roles (security-rbac.md)."""

from __future__ import annotations

import time
import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.db import engine
from app.models import Org, OrgMember


def create_org(*, name: str, owner_user_id: str) -> dict[str, Any]:
    org_id = f"org_{uuid.uuid4().hex[:16]}"
    now = time.time()
    with Session(engine) as session:
        session.add(
            Org(
                id=org_id,
                name=(name or "Untitled org").strip()[:120] or "Untitled org",
                created_at=now,
                updated_at=now,
            )
        )
        session.add(
            OrgMember(
                org_id=org_id,
                user_id=owner_user_id,
                role="owner",
                created_at=now,
            )
        )
        session.commit()
    return {"id": org_id, "name": name, "role": "owner"}


def get_org_member_role(*, org_id: str, user_id: str) -> str | None:
    oid = (org_id or "").strip()
    uid = (user_id or "").strip()
    if not oid or not uid:
        return None
    with Session(engine) as session:
        row = session.exec(
            select(OrgMember).where(
                OrgMember.org_id == oid,
                OrgMember.user_id == uid,
            )
        ).first()
        if not row:
            return None
        return str(row.role or "").lower() or None


def upsert_org_member(
    *,
    org_id: str,
    user_id: str,
    role: str,
) -> dict[str, Any]:
    oid = (org_id or "").strip()
    uid = (user_id or "").strip()
    r = (role or "member").strip().lower()
    if r not in {"owner", "admin", "member"}:
        raise ValueError("invalid_org_role")
    if not oid or not uid:
        raise ValueError("org_id_and_user_required")
    now = time.time()
    with Session(engine) as session:
        row = session.exec(
            select(OrgMember).where(
                OrgMember.org_id == oid,
                OrgMember.user_id == uid,
            )
        ).first()
        if row:
            row.role = r
            session.add(row)
        else:
            session.add(
                OrgMember(org_id=oid, user_id=uid, role=r, created_at=now)
            )
        session.commit()
    return {"org_id": oid, "user_id": uid, "role": r}


def list_org_members(*, org_id: str) -> list[dict[str, Any]]:
    oid = (org_id or "").strip()
    if not oid:
        return []
    with Session(engine) as session:
        rows = session.exec(select(OrgMember).where(OrgMember.org_id == oid)).all()
        return [
            {"org_id": r.org_id, "user_id": r.user_id, "role": r.role, "created_at": r.created_at}
            for r in rows
        ]
