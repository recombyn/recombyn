<p align="center">
  <img src="docs/assets/readme-hero-v2.jpg" alt="recombyn — 开源画布 + AI Design Agent" width="920" />
</p>

<p align="center">
  <a href="docs/self-hosting.md"><strong>自托管</strong></a> ·
  <a href="https://recombyn.com"><strong>Cloud</strong></a> ·
  <a href="https://recombyn.github.io/recombyn/"><strong>文档</strong></a>
</p>

<p align="center">
  <a href="docs/self-hosting.md"><img src="https://img.shields.io/badge/self--host-Docker%20Compose-2496ED?logo=docker&logoColor=white" alt="Self-host" /></a>
  <a href="apps/web"><img src="https://img.shields.io/badge/web-React%20%2B%20TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="apps/api"><img src="https://img.shields.io/badge/api-FastAPI%20%2B%20Python-3776AB?logo=python&logoColor=white" alt="Python" /></a>
</p>

<p align="center">
  <a href="README.md"><img src="docs/assets/lang-en.png" alt="English" height="28" /></a>
  &nbsp;
  <a href="README.zh-CN.md"><img src="docs/assets/lang-zh-CN.png" alt="简体中文" height="28" /></a>
  &nbsp;
  <a href="README.ja.md"><img src="docs/assets/lang-ja.png" alt="日本語" height="28" /></a>
</p>

**Recombyn** 是 **画布编辑器 + AI Design Agent**。  
在无限画布上创作；右侧对话里的 Design Agent（LangGraph）会规划并执行画布操作——直接改画板、图层、形状、文字与布局。

几分钟用 Docker Compose 自托管（默认 **MySQL** + Redis + Web + API + **Yjs 协作**）。本地开发可空 `DATABASE_URL` 用 **SQLite**；也可切 **PostgreSQL**（见 [docs/postgres-switch.md](docs/postgres-switch.md)）。

---

## 帮忙点个 ⭐ Star

开源不易，如果觉得 Recombyn 对您的工作还有帮助，请帮忙在 GitHub 仓库右上角点个 ⭐ Star。您的支持是让 Recombyn 变得更好最大的动力。

→ [https://github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)

## 画布

自研 **RCB**（Resume Canvas）无限画布：`SceneDocument` 场景图 + CSS 相机（约 5%–10000%）；已提交图元以 **逐节点 SVG host** 绘制，**Path2D** 负责命中检测与选区/工具叠加；视口裁剪 + **LOD**（远景 AABB 代理，同屏全量 host 有上限），大文档仍可编辑。

工程说明：[docs/canvas-architecture.md](docs/canvas-architecture.md) · Scene JSON：[docs/scene-json-spec.md](docs/scene-json-spec.md)。

**编辑能力（节选）**

- 画板、矩形/椭圆等形状、文字、图片、视频、Lottie；钢笔 / 铅笔（ribbon 轮廓笔刷）、选区与变换  
- **布尔运算**（并 / 差 / 交等）  
- **描边对齐**：居中 / **内描边** / **外描边**  
- **轮廓化**（描边 → 可编辑填充路径）与路径编辑  
- 填充、圆角、混合模式、透明度、图层叠放；导出与分享  
- **Yjs** 实时协作（光标、选区、撤销；`apps/collab`）

## Design Agent

编辑器右侧是流式对话 Agent：创建落地页 / 海报 / 改稿，挂技能、调工具，结果写回同一张画布。

### 怎么设计的（分层）

执行内核固定为 LangGraph 模板 `canvas_ops_v1`；**产品行为可配置**（Profile / 提示词包 / Skills / Tools）。

| 层 | 职责 | 不该做什么 |
|----|------|------------|
| **Kernel** | 控制循环、工具调度、画布读写、轮次 / 权限 / ops 白名单 | 不写审美与品类工艺 |
| **AgentProfile（YAML）** | 阶段协议、路由、角色、子代理、capabilities | 不替代 LangGraph 注册表 |
| **Stage 提示词包** | 每阶段 turn 协议（intent / decide / paint / review…） | 不是某品类的工艺教材 |
| **Skills** | 品类 playbook（构图、节奏、评审标准、few-shot） | 不改 JSON 图元 / patch 协议 |
| **Tools** | 原子画布操作（`create_frame`、`update_node`…） | 不含业务审美 |

典型一轮：`intent` →（闲聊 settle / 小改 `paint` / 设计 `decide`）→ `paint` 产出 `tool_ops` → `observe` → 可选 **Review 子代理** → settle。细节图与字段见 **[docs/agent-profile.md](docs/agent-profile.md)**。

### Skills 是什么

每个技能一个目录：`apps/api/seeds/design_skills/<key>/`（`_meta.json` + `SKILL.md`）。

- **`_meta.json`**：`when_to_use`、触发词、`preferred_tools`、互斥组等 —— Decide 用它选技能
- **`SKILL.md`**：该品类怎么做（落地页 / 海报 / 简历 / 仪表盘 / 动效……）

仓库里已有多套 skill（landing、poster、resume、dashboard、motion、ecommerce…），可继续加目录扩展，**不是固定 5 项**。

### Tools 是什么

画布原子操作登记在 [`apps/api/seeds/canvas_actions_seed.json`](apps/api/seeds/canvas_actions_seed.json)。Agent 在 paint 阶段发出结构化 `tool_ops`，由宿主校验并落到画布。技能可以声明偏好工具，但不能发明协议外的 op。

### 可配置 Agent：改哪些文件

| 文件 | 用途 |
|------|------|
| [`apps/api/seeds/agents/profiles/design.canvas.yaml`](apps/api/seeds/agents/profiles/design.canvas.yaml) | **默认 Profile**：阶段、roles、subagents、skills/tools catalog、`$kv` 路由 |
| [`apps/api/seeds/agents/bindings.yaml`](apps/api/seeds/agents/bindings.yaml) | `product` / `surface` → 用哪个 Profile |
| [`apps/api/seeds/design_prompt_packs/`](apps/api/seeds/design_prompt_packs/) | 各 stage 提示词正文 |
| [`apps/api/seeds/design_skills/`](apps/api/seeds/design_skills/) | 新增 / 改技能 |
| [`apps/api/seeds/canvas_actions_seed.json`](apps/api/seeds/canvas_actions_seed.json) | 工具目录 |
| `apps/api/.env` → `AGENT_PROFILE_ID` | 强制指定 Profile（默认 `design.canvas`；空串则走 bindings） |

**换一个 Agent（示例）**

1. 复制 `profiles/design.canvas.yaml` → `profiles/my.agent.yaml`，改 `id:` / `metadata` / `identity` / `capabilities` 等  
2. 在 `bindings.yaml` 里把对应 `when` 指到新 id，或设 `AGENT_PROFILE_ID=my.agent`  
3. 重启 API；Profile 从磁盘加载（不是 DB 行）

**加一个 Skill（示例）**

1. 新建 `design_skills/my_scene/_meta.json` + `SKILL.md`  
2. 填触发条件与 `preferred_tools`  
3. 重启 / 重新 ensure seeds 后，Decide 即可按触发挂上

私有扩展也可放在 [`plugins/skills/`](plugins/skills/)（Compose 已挂载）。写法见 [docs/skill-extensions.md](docs/skill-extensions.md)。

环境开关（Review 开关、超时等）见 [docs/agent-profile.md § Env knobs](docs/agent-profile.md#env-knobs)；种子总览 [`apps/api/seeds/README.md`](apps/api/seeds/README.md)。模型密钥 / OpenRouter： [docs/self-hosting.md](docs/self-hosting.md)。

## 快速开始（自托管）

```bash
git clone https://github.com/recombyn/recombyn.git
cd recombyn
cp apps/api/.env.example apps/api/.env   # 填入 LLM_API_KEY 等
docker compose up -d --build
```

| 服务 | 地址 |
|------|------|
| Web | http://localhost:3000 |
| API 文档 | http://localhost:8000/docs |
| MySQL | `127.0.0.1:3306` · `recombyn` / `recombyn` |

更多选项（环境变量、模型密钥、生产加固）：**[docs/self-hosting.md](docs/self-hosting.md)** · Postgres：**[docs/postgres-switch.md](docs/postgres-switch.md)**

### 本地开发

```bash
docker compose up -d redis
npm install
cp apps/api/.env.example apps/api/.env
npm run dev:api              # 空 DATABASE_URL → SQLite
npm run dev:collab           # Yjs WS :1234（可选；Vite DEV 默认开协作）
npm run dev:web
```

画布 Live / WSS：**[docs/self-hosting.md § Canvas multiplayer](docs/self-hosting.md#canvas-multiplayer-yjs--wss)** · [apps/collab/README.md](apps/collab/README.md)

### 桌面端（Tauri）

详见 **[docs/desktop.md](docs/desktop.md)**。需 **Rust** 与平台工具链。

```bash
# 单机 — 内嵌 API sidecar + SQLite
npm run dev:desktop
npm run build:desktop:sidecar
npm run build:desktop

# 云端桌面 — 与浏览器同一套本机 API（:8000 / .env）
# 有公网部署时再设 VITE_API_BASE_URL
npm run dev:desktop:cloud
npm run build:desktop:cloud
```

打包产物：`apps/web/src-tauri/target/release/bundle/`（安装包）；主程序 `…/target/release/recombyn.exe`。

## 仓库结构

```
apps/web/          React 画布 + Agent UI + Yjs 客户端
  src-tauri/       Tauri v2 桌面壳（Recombyn）
apps/api/          FastAPI（含 collab room-token）
apps/collab/       Yjs WebSocket 服务（y-websocket）
packages/          共享协议
docs/              架构、自托管、桌面端、画布与 Web 数据层（工程向；含 Postgres 切换）
deploy/            Dockerfile / Nginx
e2e/               Playwright
```

面向用户的帮助文档**源码**在私有仓维护；CI 只把打包后的静态站推到本仓库 `gh-pages`，见 [recombyn.github.io/recombyn/](https://recombyn.github.io/recombyn/)。

## 文档与社区

- 用户文档：[recombyn.github.io/recombyn](https://recombyn.github.io/recombyn/)
- 自托管 / 架构：[docs/self-hosting.md](docs/self-hosting.md) · [AgentProfile / 子代理](docs/agent-profile.md) · [桌面端](docs/desktop.md) · [Postgres](docs/postgres-switch.md)
- 画布（RCB / SVG / Path2D / LOD）：[docs/canvas-architecture.md](docs/canvas-architecture.md)
- Web 数据层（Query / oRPC / nuqs）：[docs/web-frontend.md](docs/web-frontend.md)
- Scene JSON：[docs/scene-json-spec.md](docs/scene-json-spec.md)
- [贡献](CONTRIBUTING.md) · [安全](SECURITY.md) · [行为准则](CODE_OF_CONDUCT.md)
- Issue / PR 模板见 `.github/`
官网：[recombyn.com](https://recombyn.com) · 文档：[recombyn.github.io/recombyn](https://recombyn.github.io/recombyn/) · 源码：[github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)
