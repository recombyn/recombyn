<p align="center">
  <img src="docs/assets/readme-hero-v2.jpg" alt="recombyn — オープンソースのキャンバス + AI Design Agent" width="920" />
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

**Recombyn** は **キャンバスエディタ + AI Design Agent** です。  
無限キャンバス上でデザインし、サイドチャットの Design Agent（LangGraph）が計画してキャンバス操作を適用します——フレーム・レイヤー・図形・テキスト・レイアウト。

Docker Compose で数分でセルフホストできます（既定は **MySQL** + Redis + Web + API + **Yjs コラボ**）。ローカル開発では空の `DATABASE_URL` で **SQLite**、または **PostgreSQL** — [docs/postgres-switch.md](docs/postgres-switch.md) を参照。

---

## キャンバス

自作 **RCB**（Resume Canvas）無限キャンバス：`SceneDocument` + CSS カメラ（約 5%–10000%）。確定図元は **ノード単位 SVG host**、**Path2D** はヒットテスト / 選択オーバーレイ用。ビューポート cull + **LOD**（遠景 AABB プロキシ）で大きなドキュメントも編集可能。

詳細：[docs/canvas-architecture.md](docs/canvas-architecture.md) · Scene JSON：[docs/scene-json-spec.md](docs/scene-json-spec.md)。

**編集機能（抜粋）**

- フレーム、図形、テキスト、画像、動画、Lottie；ペン / 鉛筆（ribbon 輪郭ブラシ）、選択と変形  
- **ブール演算**（和 / 差 / 積など）  
- **ストローク揃え**：中央 / **内側** / **外側**  
- **輪郭化**（ストローク → 編集可能な塗りパス）とパス編集  
- 塗り、角丸、ブレンド、不透明度、レイヤー；エクスポートと共有  
- **Yjs** リアルタイム共同編集（カーソル・選択・Undo；`apps/collab`）

## Design Agent

エディタ右側のストリーミング会話 Agent が、同じキャンバス上でランディング / ポスター作成・改稿・スキル・ツールを実行します。

### どう設計されているか（レイヤー）

実行カーネルは LangGraph テンプレート `canvas_ops_v1` で固定。**製品挙動は設定可能**（Profile / プロンプトパック / Skills / Tools）。

| 層 | 担当 | やってはいけないこと |
|----|------|----------------------|
| **Kernel** | 制御ループ、ツールスケジュール、キャンバス R/W、ラウンド / 権限 / ops 許可 | 審美や品類クラフト |
| **AgentProfile（YAML）** | 段階プロトコル、ルーティング、役割、サブエージェント、capabilities | LangGraph レジストリの代替 |
| **Stage プロンプトパック** | 段階ごとの turn プロトコル | 品類のクラフト教材 |
| **Skills** | ドメイン playbook（構図・リズム・レビュー基準・few-shot） | JSON 図元 / patch スキーマ変更 |
| **Tools** | 原子キャンバス操作（`create_frame`、`update_node`…） | ビジネス審美 |

典型フロー：`intent` →（雑談 settle / 軽改 `paint` / 設計 `decide`）→ `paint` が `tool_ops` を出す → `observe` → 任意の **Review** サブエージェント → settle。詳細は **[docs/agent-profile.md](docs/agent-profile.md)**。

### Skills とは

スキルごとに `apps/api/seeds/design_skills/<key>/`（`_meta.json` + `SKILL.md`）。

- **`_meta.json`** — トリガー、`preferred_tools` など（Decide が選ぶ）
- **`SKILL.md`** — その成果物の作り方

多数同梱（固定 5 個ではない）。フォルダ追加で拡張。

### Tools とは

原子操作は [`apps/api/seeds/canvas_actions_seed.json`](apps/api/seeds/canvas_actions_seed.json)。Paint が構造化 `tool_ops` を出し、ホストが検証してキャンバスに適用。Skills は好みのツールを宣言できるが、登録外の op は不可。

### 設定可能な Agent — どのファイルか

| ファイル | 用途 |
|----------|------|
| [`apps/api/seeds/agents/profiles/design.canvas.yaml`](apps/api/seeds/agents/profiles/design.canvas.yaml) | **既定 Profile** |
| [`apps/api/seeds/agents/bindings.yaml`](apps/api/seeds/agents/bindings.yaml) | `product` / `surface` → Profile |
| [`apps/api/seeds/design_prompt_packs/`](apps/api/seeds/design_prompt_packs/) | 段階プロンプト本文 |
| [`apps/api/seeds/design_skills/`](apps/api/seeds/design_skills/) | スキル追加・編集 |
| [`apps/api/seeds/canvas_actions_seed.json`](apps/api/seeds/canvas_actions_seed.json) | ツールカタログ |
| `apps/api/.env` → `AGENT_PROFILE_ID` | Profile 強制指定（既定 `design.canvas`） |

**Agent を差し替える**

1. `profiles/design.canvas.yaml` をコピーして `id:` などを変更  
2. `bindings.yaml` を更新するか `AGENT_PROFILE_ID=…` を設定  
3. API を再起動（ディスクから読み込み、DB 行ではない）

**Skill を追加する**

1. `design_skills/my_scene/_meta.json` + `SKILL.md` を作成  
2. トリガーと `preferred_tools` を記入  
3. 再起動 / seed ensure 後、Decide がアタッチできる

Env： [docs/agent-profile.md § Env knobs](docs/agent-profile.md#env-knobs)。Seeds： [`apps/api/seeds/README.md`](apps/api/seeds/README.md)。モデル： [docs/self-hosting.md](docs/self-hosting.md)。

## 主な機能

- **キャンバス編集** — 上記（ブール、内外ストローク、輪郭化、メディア、エクスポートなど）  
- **リアルタイムコラボ** — Yjs WebSocket（`apps/collab`）；エディタの Live バー；nginx `/collab/` 経由の WSS  
- **Design Agent** — LangGraph + 設定可能な Profile / Skills / ツール；作成・編集・ストリーミング UI  
- **カスタムモデル & 集約プラットフォーム** — BYOK、手動 OpenAI 互換エンドポイント、OpenRouter など  
- **画像インポート** — ローカル画像 → 編集可能なキャンバスノード  
- **Plaza & プロジェクト** — インスピレーションフィードと保存作品（API）

## クイックスタート（セルフホスト）

```bash
git clone https://github.com/recombyn/recombyn.git
cd recombyn
cp apps/api/.env.example apps/api/.env   # LLM_API_KEY / プロバイダキーを設定
docker compose up -d --build
```

| サービス | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| MySQL | `127.0.0.1:3306` · `recombyn` / `recombyn` |

詳細（env、LLM、本番 hardening）: **[docs/self-hosting.md](docs/self-hosting.md)** · Postgres: **[docs/postgres-switch.md](docs/postgres-switch.md)**

### ローカル開発

```bash
docker compose up -d redis   # または: mysql redis
npm install
cp apps/api/.env.example apps/api/.env
npm run dev:api              # 空 DATABASE_URL → SQLite
npm run dev:collab           # Yjs WS :1234（任意）
npm run dev:web
```

Canvas Live / WSS: **[docs/self-hosting.md § Canvas multiplayer](docs/self-hosting.md#canvas-multiplayer-yjs--wss)** · [apps/collab/README.md](apps/collab/README.md)

### デスクトップ（Tauri）

**[docs/desktop.md](docs/desktop.md)** を参照。**Rust** と OS ビルドツールが必要です。

```bash
# ローカル — API sidecar + SQLite 同梱
npm run dev:desktop
npm run build:desktop:sidecar
npm run build:desktop

# クラウド — https://recombyn.com（VITE_API_BASE_URL で上書き可）
npm run dev:desktop:cloud
npm run build:desktop:cloud
```

成果物: `apps/web/src-tauri/target/release/bundle/`（インストーラ）；本体 `…/target/release/recombyn.exe`。

## リポジトリ構成

```
apps/web/          React キャンバス + Agent UI + Yjs クライアント
  src-tauri/       Tauri v2 デスクトップシェル（Recombyn）
apps/api/          FastAPI — Scene, Agent, plaza, wallet, collab tokens
apps/collab/       Yjs WebSocket サーバー（y-websocket）
packages/          共有ビルダー & スキーマ
docs/              アーキテクチャ + セルフホスト + デスクトップ（開発者向け）
deploy/            Dockerfile / Nginx
e2e/               Playwright
```

ユーザー向けヘルプの**ソース**はプライベート管理。CI がビルド成果物だけを本リポジトリの `gh-pages` に載せ、[recombyn.github.io/recombyn/](https://recombyn.github.io/recombyn/) で公開します。

## ドキュメント / コミュニティ

- ユーザー向け: [recombyn.github.io/recombyn](https://recombyn.github.io/recombyn/)
- セルフホスト / 構成: [docs/self-hosting.md](docs/self-hosting.md) · [デスクトップ](docs/desktop.md) · [Postgres](docs/postgres-switch.md)
- [コントリビュート](CONTRIBUTING.md) · [セキュリティ](SECURITY.md) · [行動規範](CODE_OF_CONDUCT.md)
- Issue / PR テンプレートは `.github/`

公式: [recombyn.com](https://recombyn.com) · Docs: [recombyn.github.io/recombyn](https://recombyn.github.io/recombyn/) · Source: [github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)

## GitHub で ⭐ Star を

オープンソースは時間がかかります。Recombyn が役に立ったら、右上の **⭐ Star** をお願いします。

→ [https://github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)
