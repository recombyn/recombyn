"""FastAPI dependencies: DB session, current user, admin."""

from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.services.auth import SessionUser, get_session
from app.services.auth.admin import is_admin_user

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/email/login",
)
optional_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/email/login",
    auto_error=False,
)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]
OptionalTokenDep = Annotated[str | None, Depends(optional_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> SessionUser:
    user = get_session(token, db=session)
    if not user:
        # 401 (not 403): axios / App treat this as session death and clear local auth.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_status = (getattr(user, "status", None) or "active").strip().lower()
    if user_status == "disabled":
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


def get_current_user_optional(
    session: SessionDep,
    token: OptionalTokenDep,
) -> SessionUser | None:
    if not token:
        return None
    return get_session(token, db=session)


CurrentUser = Annotated[SessionUser, Depends(get_current_user)]
OptionalUser = Annotated[SessionUser | None, Depends(get_current_user_optional)]


def get_current_active_superuser(current_user: CurrentUser) -> SessionUser:
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=403,
            detail="The user doesn't have enough privileges",
        )
    return current_user


AdminUser = Annotated[SessionUser, Depends(get_current_active_superuser)]

# Resource×action permissions (Phase 3+). Coarse roles still gate today;
# helpers encode the matrix so org_role can plug in later without a mega rbac module.
Permission = str  # e.g. "admin:users:write", "project:write", "plaza:moderate"

_ADMIN_PERMISSIONS: frozenset[str] = frozenset(
    {
        "admin:users:read",
        "admin:users:write",
        "admin:plaza:moderate",
        "admin:catalog:write",
        "admin:design:write",
        "admin:fonts:write",
        "admin:content:read",
        "admin:notices:write",
        "admin:metrics:read",
    }
)


def user_has_permission(user: SessionUser, permission: Permission) -> bool:
    """Deny-by-default permission check beside coarse admin role."""
    if not permission:
        return False
    if is_admin_user(user):
        return permission in _ADMIN_PERMISSIONS or permission.startswith("admin:")
    # End-user surface (extend when org roles land).
    if permission in {"project:write", "project:read", "upload:write", "wallet:read"}:
        return True
    return False


def require_permission(permission: Permission):
    """FastAPI dependency factory: `Depends(require_permission('admin:users:write'))`."""

    def _dep(current_user: CurrentUser) -> SessionUser:
        if not user_has_permission(current_user, permission):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "permission_denied",
                    "permission": permission,
                },
            )
        return current_user

    return _dep


def audit_admin_mutation(
    *,
    actor: SessionUser,
    action: str,
    resource: str,
    resource_id: str | None = None,
    trace_id: str | None = None,
) -> None:
    """Structured audit line for admin writes (ADR 0007 correlation)."""
    import logging

    logging.getLogger("recombyn.audit").info(
        "admin_audit action=%s resource=%s resource_id=%s actor=%s trace_id=%s",
        action,
        resource,
        resource_id or "",
        getattr(actor, "id", ""),
        trace_id or "",
        extra={
            "event": "admin_audit",
            "user_id": getattr(actor, "id", None),
            "trace_id": trace_id,
            "action": action,
            "resource": resource,
        },
    )
