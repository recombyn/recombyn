"""Org RBAC skeleton unit tests."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException


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
    from pathlib import Path

    versions = Path(__file__).resolve().parents[2] / "app" / "alembic" / "versions"
    names = {p.name for p in versions.glob("*.py")}
    assert "0006_org_members.py" in names
