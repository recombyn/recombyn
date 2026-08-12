"""Org membership HTTP API (create / list / invite)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, SessionUser, require_org_permission
from app.services.auth import orgs as org_store

router = APIRouter(prefix="/orgs", tags=["orgs"])


class CreateOrgIn(BaseModel):
    name: str = Field(default="Untitled org", max_length=120)


class InviteMemberIn(BaseModel):
    userId: str | None = Field(default=None, max_length=64)
    email: str | None = Field(default=None, max_length=320)
    role: str = Field(default="member", max_length=16)


@router.post("")
def create_org(current_user: CurrentUser, body: CreateOrgIn) -> dict[str, Any]:
    row = org_store.create_org(name=body.name, owner_user_id=current_user.id)
    return {"org": row}


@router.get("/mine")
def list_my_orgs(current_user: CurrentUser) -> dict[str, Any]:
    return {"orgs": org_store.list_orgs_for_user(user_id=current_user.id)}


@router.get("/{org_id}")
def get_org(
    org_id: str,
    current_user: SessionUser = Depends(require_org_permission("org:project:read")),
) -> dict[str, Any]:
    _ = current_user
    row = org_store.get_org(org_id=org_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return {"org": row}


@router.get("/{org_id}/members")
def list_members(
    org_id: str,
    current_user: SessionUser = Depends(require_org_permission("org:project:read")),
) -> dict[str, Any]:
    _ = current_user
    return {"members": org_store.list_org_members(org_id=org_id)}


@router.post("/{org_id}/members")
def invite_member(
    org_id: str,
    body: InviteMemberIn,
    current_user: SessionUser = Depends(require_org_permission("org:members:write")),
) -> dict[str, Any]:
    _ = current_user
    try:
        row = org_store.invite_org_member(
            org_id=org_id,
            actor_user_id=current_user.id,
            user_id=body.userId,
            email=body.email,
            role=body.role,
        )
    except LookupError:
        raise HTTPException(
            status_code=404,
            detail={"code": "user_not_found"},
        ) from None
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": str(exc)},
        ) from exc
    return {"member": row}
