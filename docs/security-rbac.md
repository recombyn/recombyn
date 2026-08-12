# RBAC & authorization (current → next)

Living notes for Phase 3+. Coarse roles remain; resource×action helpers are live.

## Today

| Principal | How | Can do |
|-----------|-----|--------|
| Anonymous | No Bearer | Public project cover thumbs only; health/docs |
| `user` | `CurrentUser` | Own projects, uploads under `uploads/{user_id}/`, wallet, Design Agent |
| `admin` | `AdminUser` / `is_admin_user` | Admin catalog, design skills, metrics, bootstrap email/id |

### Resource×action helpers (`app.api.deps`)

| API | Meaning |
|-----|---------|
| `user_has_permission(user, "admin:users:write")` | Deny-by-default matrix check |
| `Depends(require_permission("admin:users:write"))` | FastAPI dependency |
| `audit_admin_mutation(...)` | Structured admin write log (`recombyn.audit` + `trace_id`) |

Shipped admin permission strings:

- `admin:users:read` / `admin:users:write`
- `admin:plaza:moderate`
- `admin:catalog:write` / `admin:design:write` / `admin:fonts:write`
- `admin:content:read` / `admin:notices:write` / `admin:metrics:read`

End-user permissions today: `project:read` / `project:write` / `upload:write` / `wallet:read`.

Example: `PATCH /admin/users/{id}` uses `require_permission("admin:users:write")` + audit line.

Source of truth:

- Role string on user: `user` \| `admin` (`app.services.auth.admin.is_admin_user`)
- Bootstrap env: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_ID`, `SUPER_ADMIN_BOOTSTRAP_PASSWORD`
- HTTP deps: `app.api.deps.CurrentUser` / `AdminUser` / `require_permission`

## Incremental next steps

1. When org/teams land: introduce `org_role` table + checks beside `is_admin_user`, not a parallel auth stack.
2. Prefer deny-by-default helpers next to the owning router (in-file), not a mega `rbac.py` until 3+ domains share more than the matrix above.
3. Expand `audit_admin_mutation` to remaining admin write routes.

## Process

- Security reports: [SECURITY.md](../SECURITY.md)
- Architecture boundaries: [ADR 0004](./adr/0004-modular-monolith-first.md)
- Upload content policy: [ADR 0008](./adr/0008-upload-content-validation.md)
