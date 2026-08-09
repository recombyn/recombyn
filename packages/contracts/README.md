# @resume-scene/contracts

OpenAPI → oRPC contracts for the web client (`OpenAPILink` + TanStack Query).

## Generate

1. API running on `http://127.0.0.1:8000` (or set `OPENAPI_URL`), **or** a working `apps/api` Python env for offline export.
2. From repo root:

```bash
npm run gen:contracts
```

Writes:
- `openapi/api-openapi.json` (paths stripped of `/api/v1`)
- `generated/api/orpc.gen.ts` + `zod.gen.ts`

Commit `generated/` so web builds without a live API.
