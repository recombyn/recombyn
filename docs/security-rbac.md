# RBAC & authorization (current → next)

Living notes for Phase 3. Not a full IAM product yet.

## Today (coarse)

| Principal | How | Can do |
|-----------|-----|--------|
| Anonymous | No Bearer | Public project cover thumbs only; health/docs |
| `user` | `CurrentUser` | Own projects, uploads under `uploads/{user_id}/`, wallet, Design Agent |
| `admin` | `AdminUser` / `is_admin_user` | Admin catalog, design skills, metrics, bootstrap email/id |

Source of truth:

- Role string on user: `user` \| `admin` (`app.services.auth.admin.is_admin_user`)
- Bootstrap env: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_ID`, `SUPER_ADMIN_BOOTSTRAP_PASSWORD`
- HTTP deps: `app.api.deps.CurrentUser` / `AdminUser`

There is **no** resource×action matrix (e.g. `project:write` vs `plaza:moderate`) yet.

## Incremental next steps (do not block shipping)

1. Document every admin route under `apps/api/app/api/routes/admin/` with required role (already `AdminUser`).
2. When org/teams land: introduce `org_role` table + checks beside `is_admin_user`, not a parallel auth stack.
3. Prefer deny-by-default helpers next to the owning router (in-file), not a mega `rbac.py` until 3+ domains share the matrix.
4. Audit log: admin mutations should keep `user_id` + `trace_id` (ADR 0007).

## Process

- Security reports: [SECURITY.md](../SECURITY.md)
- Architecture boundaries: [ADR 0004](./adr/0004-modular-monolith-first.md)
- Upload content policy: [ADR 0008](./adr/0008-upload-content-validation.md)
