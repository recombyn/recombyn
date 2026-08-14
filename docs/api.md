# API

The HTTP API is FastAPI. Local base: `http://localhost:8000/api/v1` · Swagger: http://127.0.0.1:8000/docs

Architecture / Agent: [self-hosting.md](./self-hosting.md#architecture) · Profile / sub-agents: [agent-profile.md](./agent-profile.md) · User docs: [recombyn.github.io/recombyn](https://recombyn.github.io/recombyn/)

| Prefix | Notes |
|--------|-------|
| `/auth` | Login / OAuth / session |
| `/projects` | Project CRUD |
| `/plaza` | Feed / submissions / likes |
| `/chat` · `/chat-sessions` | Agent chat |
| `/uploads` · `/fonts` | Uploads / fonts |
| `/image-tools` | Vision tools |
| `/shares` · `/notices` · `/users` | Shares, notices, directory |
| `/design/*` | Design Agent SSE, catalog, scene |

`POST /design/run` extras (see [agent-profile.md](./agent-profile.md#run-request-locale--design-intensity)):

| Field | Values | Role |
|-------|--------|------|
| `locale` | `zh-CN` \| `zh-TW` \| `en` \| `ja` | Agent output language |
| `design_intensity` | `light` \| `medium` \| `high` \| `extreme` | Pipeline depth (review + strategy stack), not model thinking |
| `/import/*` | Image → Scene |
| `/admin/*` | Admin only |

`GET /api/v1/health` → `{ "status": "ok"|"degraded", "checks": { … } }`
