# Vision tools & Recombyn Intelligence

Industrial image tools (抠图 / 编辑文字 / 图片分层 / 标记) run on the **closed-source** [recombyn-intelligence](https://github.com/recombyn/recombyn-intelligence) service. The open-source web app is a **BFF only** — it does not ship local rembg, SAM, or LaMa fallbacks for these tools.

## Quick start (local)

```bash
# Terminal 1 — intelligence (sibling repo)
cd ../recombyn-intelligence
python -m venv .venv && .venv/Scripts/activate   # Windows
pip install -e ".[dev]"                            # add .[ocr] for editText / Mark OCR
INTELLIGENCE_SERVICE_API_KEY=dev-key \
  python -m uvicorn recombyn_intelligence_service.app:app --host 127.0.0.1 --port 8091

# Terminal 2 — full stack (web + collab + API + intelligence)
cd resume-creation-web
npm run dev:full
```

Configure `apps/api/.env`:

```env
RECOMBYN_INTELLIGENCE_MODE=cloud
RECOMBYN_INTELLIGENCE_URL=http://127.0.0.1:8091
RECOMBYN_INTELLIGENCE_API_KEY=dev-key
```

## UI behavior

| Intelligence configured | Toolbar |
|-------------------------|---------|
| Yes | 去背景 · 编辑文字 · 图片分层 · 标记 · **贴样机** (closed-source mockup) |
| No | Hidden (upscale / eraser / multi-angle still work) |

`GET /api/v1/image/tools` returns:

```json
{
  "ilp": {
    "enabled": true,
    "supports": ["removeBg", "editText", "editElements", "detectRegions"]
  },
  "mockup": {
    "enabled": true,
    "templates": [{ "id": "demo-cylinder", "width": 720, "height": 960 }]
  }
}
```

## API map (BFF → intelligence)

| Editor action | BFF `kind` | Intelligence endpoint |
|---------------|------------|------------------------|
| 去背景 | `removeBg` | `POST /api/v1/pipeline/segment` |
| 编辑文字 | `editText` | `POST /api/v1/pipeline/text-decompose` |
| 图片分层 | `editElements` | `POST /api/v1/pipeline/jobs` (+ poll) |
| 标记 | `detectRegions` | `POST /api/v1/pipeline/detect-regions` |

## Product mockup (closed-source, P0)

Mockup rendering lives in **recombyn-intelligence** only. The OSS web app proxies it when `RECOMBYN_INTELLIGENCE_URL` is set; otherwise **贴样机** is hidden and `POST /api/v1/mockup/render` returns 503.

| Action | BFF | Intelligence |
|--------|-----|--------------|
| List templates | `GET /api/v1/mockup/tools` | `GET /api/v1/mockup/templates` |
| Render preview | `POST /api/v1/mockup/render` | `POST /api/v1/mockup/render` |
| Batch render | `POST /api/v1/mockup/render/batch` | `POST /api/v1/mockup/render/batch` |
| PSD layers | — | `POST /api/v1/mockup/render/psd` |
| Bake template | — | `POST /api/v1/mockup/bake` (photo + mask) |

Default templates: `demo-cylinder` (mug), `demo-glass` (Fresnel glass). See `recombyn-intelligence/docs/mockup-architecture.md`.

## Document import

When `USE_VISION=true` and intelligence is configured, **image import** (`POST /api/v1/import/*`) routes OCR/layout to:

`POST /api/v1/pipeline/analyze-pages` on intelligence.

If intelligence is unavailable and local PaddleOCR is not installed, import falls back to raster-only (page image as canvas layer).

See [import-pipeline.md](./import-pipeline.md).

## Smoke tests

```bash
# Intelligence service
cd recombyn-intelligence
python scripts/test_ilp_e2e.py --mode all

# Web BFF routing (offline)
cd resume-creation-web/apps/api
python scripts/test_ilp_bff_smoke.py --mock
```

## Optional: OCR on intelligence

`editText` and Mark `detect-regions` need PaddleOCR on the intelligence host:

```bash
pip install -e ".[ocr]"
# Install PaddlePaddle for your platform separately
```

## Docker image

The default `Dockerfile` installs `.[queue,ocr]` so **editText** and **Mark** work in containerized deployments (PaddleOCR + system libs). Rebuild after pulling:

```bash
docker build -t recombyn-intelligence .
```

Compose profile from `resume-creation-web`:

```bash
docker compose --profile intelligence \
  -f docker-compose.yml -f docker-compose.intelligence.yml \
  up -d --build
```

## Health

- API: `GET /api/v1/health` → `checks.intelligence`
- Intelligence: `GET /health`
