"""Org RBAC skeleton unit tests."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from tests.conftest import restore_default_sqlite_engine


def test_org_role_rank():
    from app.api.deps import org_role_at_least, user_has_org_permission

    assert org_role_at_least("owner", "admin") is True
    assert org_role_at_least("member", "admin") is False

    user = SimpleNamespace(id="u1", role="user", email="u@x.com")
    assert (
        user_has_org_permission(
            user=user,
            org_id="org_1",
            permission="org:project:write",
            member_role="member",
        )
        is True
    )
    assert (
        user_has_org_permission(
            user=user,
            org_id="org_1",
            permission="org:members:write",
            member_role="member",
        )
        is False
    )
    assert (
        user_has_org_permission(
            user=user,
            org_id="org_1",
            permission="org:members:write",
            member_role="admin",
        )
        is True
    )


def test_require_org_permission_denied(monkeypatch: pytest.MonkeyPatch):
    from app.api import deps as deps_mod

    monkeypatch.setattr(
        "app.services.auth.orgs.get_org_member_role",
        lambda **_k: "member",
    )
    dep = deps_mod.require_org_permission("org:members:write")
    user = SimpleNamespace(id="u1", role="user", email="u@x.com")
    with pytest.raises(HTTPException) as ei:
        dep(user, "org_1")  # type: ignore[arg-type]
    assert ei.value.status_code == 403
    assert ei.value.detail["code"] == "org_permission_denied"


def test_alembic_includes_org_revision():
    versions = Path(__file__).resolve().parents[2] / "app" / "alembic" / "versions"
    names = {p.name for p in versions.glob("*.py")}
    assert "0006_org_members.py" in names
    assert "0007_project_org_id.py" in names


def _use_tmp_db(tmp_path: Path, monkeypatch, name: str) -> None:
    db = tmp_path / name
    monkeypatch.setenv("SQLITE_DB_PATH", str(db))
    monkeypatch.setenv("DATABASE_URL", "")
    from app.core.config import settings as settings_mod
    from app.core.db import reset_engine
    from app.services import db as db_mod

    settings_mod.sqlite_db_path = str(db)
    settings_mod.database_url = ""
    db_mod._SCHEMA_READY = False
    reset_engine()


def test_org_project_access_and_invite(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    _use_tmp_db(tmp_path, monkeypatch, "org-projects.db")

    from app.services.auth import orgs as org_store
    from app.services.auth.email_store import upsert_user
    from app.services.db import init_schema
    from app.services import projects as project_store

    try:
        init_schema()
        owner = upsert_user(
            email="owner@example.com",
            password="password123",
            name="Owner",
        )
        member = upsert_user(
            email="member@example.com",
            password="password123",
            name="Member",
        )
        org = org_store.create_org(name="Team A", owner_user_id=owner.id)
        org_id = org["id"]
        invited = org_store.invite_org_member(
            org_id=org_id,
            actor_user_id=owner.id,
            email="member@example.com",
            role="member",
        )
        assert invited["user_id"] == member.id
        assert invited["role"] == "member"

        created = project_store.upsert_project(
            owner.id,
            project_id=None,
            name="Shared",
            document={"nodes": {}},
            org_id=org_id,
        )
        assert created["orgId"] == org_id
        pid = created["id"]

        got = project_store.get_project(member.id, pid)
        assert got is not None
        assert got["orgId"] == org_id

        patched = project_store.upsert_project(
            member.id,
            project_id=pid,
            name="Shared renamed",
            document={"nodes": {"a": 1}},
            base_revision=created["revision"],
        )
        assert patched["name"] == "Shared renamed"
        assert patched["revision"] == created["revision"] + 1

        stranger = upsert_user(
            email="stranger@example.com",
            password="password123",
            name="Stranger",
        )
        assert project_store.get_project(stranger.id, pid) is None

        listed = project_store.list_projects(member.id, org_id=org_id)
        assert any(p["id"] == pid for p in listed["projects"])

        mine = org_store.list_orgs_for_user(user_id=member.id)
        assert any(o["id"] == org_id for o in mine)
    finally:
        restore_default_sqlite_engine()
