# API

The HTTP API is FastAPI. Local base: `http://localhost:8000/api/v1` · Swagger: http://127.0.0.1:8000/docs

Architecture / Agent: [self-hosting.md](./self-hosting.md#architecture) · Profile / sub-agents: [agent-profile.md](./agent-profile.md) · User docs: [recombyn.github.io/recombyn](https://recombyn.github.io/recombyn/)

| Prefix | Notes |
|--------|-------|
| `/auth` | Login / OAuth / session |
| `/projects` | Project CRUD + cloud version history |
| `/plaza` | Feed / submissions / likes |
| `/chat` · `/chat-sessions` | Agent chat |
| `/uploads` · `/fonts` | Uploads / fonts |
| `/image-tools` | Vision tools |
| `/shares` · `/notices` · `/users` | Shares, notices, directory |
| `/design/*` | Design Agent SSE, catalog, scene |
| `/wallet` | Credits, membership catalog, redeem |
| `/import/*` | Image → Scene |
| `/admin/*` | Admin only |

`GET /wallet/plans` — public list prices + monthly credit grants (Intelligence commercial, OSS fallback). No margin fields.

`POST /design/run` extras (see [agent-profile.md](./agent-profile.md#run-request-locale--design-intensity)):

| Field | Values | Role |
|-------|--------|------|
| `locale` | `zh-CN` \| `zh-TW` \| `en` \| `ja` | Agent output language |
| `design_intensity` | `light` \| `medium` \| `high` \| `extreme` | Pipeline depth (review + strategy stack), not model thinking |

## Project version history

Frozen document snapshots for a project (`project_versions` table, Alembic `0019_project_versions`). Kinds: **`named`** (user save, cap 50) and **`auto`** (editor milestones, cap 30). Large docs use object storage when enabled (`document_key`); small ones stay inline (`document_json`).

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/projects/{id}/versions` | List (`kind`, `page`, `pageSize`); no document body |
| `POST` | `/projects/{id}/versions` | Freeze live doc or pass `document`; `kind` = `named` \| `auto` |
| `GET` | `/projects/{id}/versions/{versionId}` | Includes full `document` |
| `PATCH` | `/projects/{id}/versions/{versionId}` | Rename / note only |
| `DELETE` | `/projects/{id}/versions/{versionId}` | Deletes snapshot (+ remote object if any) |
| `POST` | `/projects/{id}/versions/{versionId}/restore` | Writes snapshot back via project upsert; optional `baseRevision` (412 on conflict); `createBackup` freezes current live doc as `named` first |

Auth / write ACL matches project write. Errors: `version_not_found` (404), `named_limit` (409), `project_revision_conflict` (412) on restore. Service: `apps/api/app/services/project_versions.py`. Unit tests: `apps/api/tests/unit_tests/test_project_versions.py`.

`GET /api/v1/health` → `{ "status": "ok"|"degraded", "checks": { … } }`
