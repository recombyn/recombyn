<p align="center">
  <img src="docs/assets/readme-hero-v2.jpg" alt="recombyn — open-source canvas + AI Design Agent" width="920" />
</p>

<p align="center">
  <a href="docs/self-hosting.md"><strong>Self Host</strong></a> ·
  <a href="https://recombyn.com"><strong>Cloud</strong></a> ·
  <a href="https://recombyn.github.io/recombyn/"><strong>Docs</strong></a>
</p>

<p align="center">
  <a href="docs/self-hosting.md"><img src="https://img.shields.io/badge/self--host-Docker%20Compose-2496ED?logo=docker&logoColor=white" alt="Self-host" /></a>
  <a href="apps/web"><img src="https://img.shields.io/badge/web-React%20%2B%20TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="apps/api"><img src="https://img.shields.io/badge/api-FastAPI%20%2B%20Python-3776AB?logo=python&logoColor=white" alt="Python" /></a>
  <a href="SECURITY.md"><img src="https://img.shields.io/badge/security-policy-green.svg" alt="Security" /></a>
</p>

<p align="center">
  <a href="README.md"><img src="docs/assets/lang-en.png" alt="English" height="28" /></a>
  &nbsp;
  <a href="README.zh-CN.md"><img src="docs/assets/lang-zh-CN.png" alt="简体中文" height="28" /></a>
  &nbsp;
  <a href="README.ja.md"><img src="docs/assets/lang-ja.png" alt="日本語" height="28" /></a>
</p>

**Recombyn** is a **canvas editor + AI Design Agent**.  
Design on an infinite canvas; the Design Agent (LangGraph) in the side chat plans and applies canvas ops — frames, layers, shapes, text, and layout.

Self-host in minutes with Docker Compose (default **MySQL** + Redis + web + API + **Yjs collab**). Local dev can use **SQLite** (empty `DATABASE_URL`), or **PostgreSQL** — see [docs/postgres-switch.md](docs/postgres-switch.md).

---

## Star us on GitHub ⭐

Open source takes time. If Recombyn helps your work, please hit **⭐ Star** in the top-right of the GitHub repo — your support is the best fuel for making it better.

→ [https://github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)

## Canvas

Custom **RCB** (Resume Canvas) infinite editor: `SceneDocument` + CSS camera (~5%–10000%). Committed nodes paint as **per-node SVG hosts**; **Path2D** powers hit-testing and selection/tool overlays. Viewport cull + **LOD** (far AABB proxies; capped full hosts on screen) keeps large docs editable.

Details: [docs/canvas-architecture.md](docs/canvas-architecture.md) · Scene JSON: [docs/scene-json-spec.md](docs/scene-json-spec.md).

**Editing (highlights)**

- Frames, shapes, text, images, video, Lottie; pen / pencil (ribbon outline brush), selection & transform  
- **Boolean ops** (union / subtract / intersect, …)  
- **Stroke align**: center / **inside** / **outside**  
- **Outline** (stroke → editable filled path) and path editing  
- Fills, corner radius, blend modes, opacity, stacking; export & share  
- **Yjs** live collab (cursors, selection, undo; `apps/collab`)

## Design Agent

Streaming chat in the editor creates and edits on the same canvas — landing pages, posters, revisions, skills, and tools.

### How it’s designed (layers)

The execution kernel is fixed: LangGraph template `canvas_ops_v1`. **Product behavior is configurable** (Profile / prompt packs / Skills / Tools).

| Layer | Owns | Must not |
|-------|------|----------|
| **Kernel** | Control loop, tool scheduling, canvas R/W, rounds / permissions / ops allowlist | Design taste or category craft |
| **AgentProfile (YAML)** | Stage protocol, routing, roles, sub-agents, capabilities | Replace the LangGraph registry |
| **Stage prompt packs** | Per-stage turn protocol (intent / decide / paint / review / …) | Category craft curricula |
| **Skills** | Domain playbooks (layout, rhythm, review bars, few-shots) | JSON element / patch schema |
| **Tools** | Atomic canvas ops (`create_frame`, `update_node`, …) | Business aesthetics |

Typical turn: `intent` → (chat settle / lean `paint` / design `decide`) → `paint` emits `tool_ops` → `observe` → optional **Review** sub-agent → settle. Full graph: **[docs/agent-profile.md](docs/agent-profile.md)**.

### What Skills are

One folder per skill: `apps/api/seeds/design_skills/<key>/` (canonical: `_meta.json` + `SKILL.md`; optional `schema.json`, `assets/`, …).

- **`_meta.json`** — `when_to_use`, triggers, `preferred_tools`, mutex — Decide picks skills from this
- **`SKILL.md`** — how to craft that deliverable (landing, poster, resume, dashboard, motion, …)

The repo ships many skills (not a fixed “5”); add folders to extend.

### What Tools are

Atomic canvas ops live in [`apps/api/seeds/canvas_actions_seed.json`](apps/api/seeds/canvas_actions_seed.json). Paint emits structured `tool_ops`; the host validates and applies them. Skills may prefer tools; they cannot invent ops outside the registry.

### Configurable agent — which files

| File | Purpose |
|------|---------|
| [`apps/api/seeds/agents/profiles/design.canvas.yaml`](apps/api/seeds/agents/profiles/design.canvas.yaml) | **Default Profile**: stages, roles, subagents, skills/tools catalogs, `$kv` routing |
| [`apps/api/seeds/agents/bindings.yaml`](apps/api/seeds/agents/bindings.yaml) | `product` / `surface` → Profile id |
| [`apps/api/seeds/design_prompt_packs/`](apps/api/seeds/design_prompt_packs/) | Stage prompt bodies |
| [`apps/api/seeds/design_skills/`](apps/api/seeds/design_skills/) | Add / edit skills |
| [`apps/api/seeds/canvas_actions_seed.json`](apps/api/seeds/canvas_actions_seed.json) | Tool catalog |
| `apps/api/.env` → `AGENT_PROFILE_ID` | Force Profile id (default `design.canvas`; empty → use bindings) |

**Swap / add an Agent**

1. Copy `profiles/design.canvas.yaml` → `profiles/my.agent.yaml`; change `id:` / identity / capabilities  
2. Point `bindings.yaml` at the new id, or set `AGENT_PROFILE_ID=my.agent`  
3. Restart the API (Profiles load from disk, not DB rows)

**Add a Skill**

1. Create `design_skills/my_scene/_meta.json` + `SKILL.md`  
2. Fill triggers + `preferred_tools`  
3. Restart / re-ensure seeds — Decide can attach it

Private packs can also live under [`plugins/skills/`](plugins/skills/) (Compose-mounted). Authoring: [docs/skill-extensions.md](docs/skill-extensions.md).

Env knobs (Review on/off, timeouts): [docs/agent-profile.md § Env knobs](docs/agent-profile.md#env-knobs). Seeds overview: [`apps/api/seeds/README.md`](apps/api/seeds/README.md). Models / OpenRouter: [docs/self-hosting.md](docs/self-hosting.md).

## Quick start (self-host)

```bash
git clone https://github.com/recombyn/recombyn.git
cd recombyn
cp apps/api/.env.example apps/api/.env   # add LLM_API_KEY / provider keys
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| MySQL | `127.0.0.1:3306` · `recombyn` / `recombyn` |

More options (env, LLM keys, production hardening): **[docs/self-hosting.md](docs/self-hosting.md)** · Postgres: **[docs/postgres-switch.md](docs/postgres-switch.md)**

### Local development

```bash
docker compose up -d redis   # or: mysql redis
npm install
cp apps/api/.env.example apps/api/.env
npm run dev:api              # empty DATABASE_URL → SQLite
npm run dev:collab           # Yjs WS on :1234 (optional; Vite DEV defaults collab on)
npm run dev:web
```

Canvas Live / WSS setup: **[docs/self-hosting.md § Canvas multiplayer](docs/self-hosting.md#canvas-multiplayer-yjs--wss)** · [apps/collab/README.md](apps/collab/README.md)

### Desktop (Tauri)

See **[docs/desktop.md](docs/desktop.md)**. Needs **Rust** + platform toolchain.

```bash
# Local — bundled API sidecar + SQLite
npm run dev:desktop
npm run build:desktop:sidecar
npm run build:desktop

# Cloud — same API as browser (:8000 / .env)
# Optional: VITE_API_BASE_URL when hosted
npm run dev:desktop:cloud
npm run build:desktop:cloud
```

Build output: `apps/web/src-tauri/target/release/bundle/` (installers); main binary `…/target/release/recombyn.exe`.

## Repository layout

```
apps/web/          React canvas + Agent UI + Yjs client
  src-tauri/       Tauri v2 desktop shell (Recombyn)
apps/api/          FastAPI — Scene, Agent, plaza, wallet, collab tokens
apps/collab/       Yjs WebSocket server (y-websocket)
packages/          Shared builders & schemas
docs/              self-hosting, agent-profile, desktop, canvas & web frontend
deploy/            Dockerfiles / Nginx
e2e/               Playwright
```

User-facing help **source** is private; CI publishes only the built static site to this repo’s `gh-pages` branch → [recombyn.github.io/recombyn/](https://recombyn.github.io/recombyn/).

## Documentation

| | |
|--|--|
| User docs | [recombyn.github.io/recombyn](https://recombyn.github.io/recombyn/) |
| Self-host / architecture | [docs/self-hosting.md](docs/self-hosting.md) |
| Skill extensions | [docs/skill-extensions.md](docs/skill-extensions.md) |
| Canvas plugins | [docs/canvas-plugins.md](docs/canvas-plugins.md) |
| Plugin packs (`.recombyn-plugin`) | [docs/plugin-packs.md](docs/plugin-packs.md) |
| AgentProfile / sub-agents | [docs/agent-profile.md](docs/agent-profile.md) |
| Canvas (RCB / SVG / Path2D / LOD) | [docs/canvas-architecture.md](docs/canvas-architecture.md) |
| Web data layer (Query / oRPC / nuqs) | [docs/web-frontend.md](docs/web-frontend.md) |
| Scene JSON | [docs/scene-json-spec.md](docs/scene-json-spec.md) |
| Desktop | [docs/desktop.md](docs/desktop.md) |
| Postgres | [docs/postgres-switch.md](docs/postgres-switch.md) |
| Contributing · Security · CoC | [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |

## Community

- **Issues** — bug & feature templates under `.github/ISSUE_TEMPLATE/`
- **PRs** — see [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security** — report privately per [SECURITY.md](SECURITY.md)

Official: [recombyn.com](https://recombyn.com) · Docs: [recombyn.github.io/recombyn](https://recombyn.github.io/recombyn/) · Source: [github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)
