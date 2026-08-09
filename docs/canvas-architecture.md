# Canvas architecture (RCB)

Engineering notes for the infinite editor canvas. Source of truth is `apps/web/src/components/rcb` + `apps/web/src/components/editor/canvas` — keep this doc in sync when those constants change.

## Stack

| Layer | Role | Primary paths |
|-------|------|----------------|
| Stage shell | Camera, frames, product canvas | `editor/page/EditorStageWorld.tsx` |
| Camera / pan-zoom | Infinite world (`zoom` ~0.05–100) | `rcb/canvas/RcbCanvas.tsx`, `rcb/core/math.ts` (`RCB_MIN_ZOOM` / `RCB_MAX_ZOOM`) |
| Product canvas | Tools, media overlays, Redux writes | `editor/canvas/SvgCanvas.tsx` |
| Shape paint | Per-node SVG hosts + LOD proxies | `rcb/shapes/RcbShapesLayer.tsx`, `RcbShapeHost.tsx` |
| Document model | Types + Zod | `rcb/sceneNode.ts`, `packages/scene-schema` |
| Mutations | normalize / stack / CRUD | `rcb/scene/document/sceneDocument.ts` |
| Live state | `document`, selection, tools | `store/modules/editor.ts` |
| Undo | COW / patch history | `store/modules/editorHistory.ts` |
| Collab | Yjs ↔ scene ↔ Redux | `editor/collab/sceneYBridge.ts`, `CollabRoomProvider.tsx` |

Custom **RCB** scene runtime (resume canvas).

## Document shape

`SceneDocument` (see also [scene-json-spec.md](./scene-json-spec.md)):

- **`deltaSetLike`**: flat `id → SceneNode` map; `ROOT.children` (or page children) lists top-level nodes
- **`frames`**: artboard frames; paint order unified in **`stackOrder`** (`frame:id` | `node:id`, bottom → top)
- Node fields: `id`, `key`, `x/y/width/height`, `attrs`, `children[]`

There is **no hard max node count** on the document. Capacity is governed by paint/hit budgets below.

## Paint model (what you see)

### Committed ink → SVG hosts

Settled shapes/text/images paint as **per-node SVG hosts** (`RcbShapeHost`), ordered by `stackOrder`. Video / Lottie / generators add SVG plates plus `foreignObject` / React overlays from `SvgCanvas`.

### Live drawing → SVG preview (not Path2D)

Pen, pencil, shape, and frame tools portal preview into a shared scene SVG mount (`getSceneDrawPreviewMount` in `shapeHostRegistry.ts`):

- **Pen / path edit** — SVG `<g>` preview (`PenDrawFeature`, `PenPathEditFeature`)
- **Pencil** — filled **SVG ribbon** outline from `outlinePathFromPoints` (`pencilBrushes.ts`); same lattice as commit. Comment in code: tip-stamp Canvas bake lagged/jittered; preview now matches commit SVG
- **Shape / frame draw** — SVG stroke/box preview portals

`RcbSceneOverlayCanvas` (Canvas2D overlay) is **deprecated** for pen/pencil alignment; kept only for rare experiments.

### Path2D role (not main paint)

From `sceneShapes.ts`:

> Committed ink stays SVG hosts; Path2D is the shared vector kernel.

Used for:

- Hit-testing (`hitTestPath2DLocal`, `sceneHitBridge.ts`)
- Selection / draw-tool overlay strokes (`strokeCachedPath2D` / `fillCachedPath2D`)
- Cached `Path2D` by path `d` (LRU-ish, `PATH2D_CACHE_MAX = 256`)

### Pencil “ribbon”

Vector freehand is a **path-centered filled outline** (pressure + taper), not a thin `stroke`:

1. Centerline points (gap-filled)
2. `ribbonRadiiAlongPath` → `centeredRibbonOutline`
3. Closed SVG `d` filled with brush color

Same path builder for live preview and commit (`outlinePathFromPoints`).

## Viewport cull + LOD

Implemented in `RcbShapesLayer.tsx` (current constants):

| Constant | Value | Meaning |
|----------|------:|---------|
| `CULL_PAD_SCREEN_PX` | 96 | Extra screen margin before unmount |
| `INDEX_CULL_THRESHOLD` | 64 | Prefer spatial index over O(N) AABB walk |
| `EFFICIENT_ZOOM_SHAPE_THRESHOLD` | 80 | While camera moving, tighten host budget |
| `MAX_FULL_HOSTS` | **96** | Max simultaneous full SVG hosts |
| Far / moving budgets | 40 / 56 | `zoom < LOD_ZOOM_FAR` (0.42) or moving+dense |
| `MAX_PROXY_PAINT` | **4096** | Cap on Canvas2D AABB proxy rects |
| `HEAVY_PATH_D_CHARS` | 12_000 | Heavy path demotion / hit cost (`sceneShapes.ts`) |

Spatial index: `SceneSpatialRuntime` / `RcbSpatialIndex` (cell size 256 in `SvgCanvas`). Large-scene hit helpers also use `SCENE_SPATIAL_LARGE_THRESHOLD` (48) in `spatialIndex.ts`.

**Rule of thumb:** document can hold thousands of light shapes (stress benches exercise 1k–10k); **at most ~96 full SVG hosts** paint at once; overflow on-screen nodes become AABB proxies. Media/`foreignObject` nodes cost more than vector proxies.

## History / agent (related caps)

| Cap | Value | Where |
|-----|------:|--------|
| Undo entries | 50 | `HISTORY_MAX_ENTRIES` |
| Undo bytes | 64 MiB | `HISTORY_MAX_BYTES` |
| Agent inventory | ~120 nodes default | `runDesignAgent.ts` `maxNodes` — **prompt budget only**, not editor limit |

## Practical capacity

- **Light vectors:** hundreds → low thousands with cull/LOD
- **Dense zoom-out:** proxies (rects), not full detail
- **Many videos / Lotties / generators:** DOM + decode dominate before node-count alone
- **Huge path `d`:** hit-test / history pressure (`HEAVY_PATH_D_CHARS`)

## Key files (quick map)

```
apps/web/src/components/rcb/
  canvas/RcbCanvas.tsx
  shapes/RcbShapesLayer.tsx      # cull + LOD + proxy canvas
  shapes/shapeHostRegistry.ts    # host registry + draw preview mount
  scene/document/sceneShapes.ts  # Path2D cache + ribbon outline helpers
  scene/document/sceneHitBridge.ts
  tools/PenDrawFeature.tsx
  tools/PencilDrawFeature.tsx
  tools/pencilBrushes.ts
  tools/ShapeDrawFeature.tsx
  core/spatialIndex.ts
apps/web/src/components/editor/canvas/SvgCanvas.tsx
docs/scene-json-spec.md
```
