# Design Agent Eval (Gate A quality track)

Craft quality cases, not load tests. Suite: `suite.json` (from `apps/api/seeds/design_agent_eval_suite.json`). Use the cloud API stack (MySQL + platform catalog via `apps/api/.env`), not the desktop-local sidecar.

```bash
# API up + EVAL_TOKEN / E2E_TOKEN / .tmp-token.txt
npm run eval:agent
npm run eval:agent -- poster banner
npm run eval:agent -- --system

# Poster matrix: Ask / Canvas ops / Image layers
npm run eval:agent -- poster --ask
npm run eval:agent -- poster --paint-mode=ops
npm run eval:agent -- poster --paint-mode=img_layers

# Reference-image eval
node eval/design-agent/ref-ui.mjs
```

Env: `EVAL_API` (or `E2E_API`), `EVAL_TOKEN` (or `E2E_TOKEN`), `EVAL_CONCURRENCY`, `EVAL_CASE_MS`, `EVAL_OUT`, `EVAL_INTERACTION_MODE`, `EVAL_PAINT_MODE`.

Load / concurrency → `perf/k6` (`docs/quality-gates.md`).
