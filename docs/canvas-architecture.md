# Canvas architecture (RCB)

RCB is Recombyn’s infinite vector canvas. This note is for people changing paint, hit-testing, or LOD — source of truth is `apps/web/src/components/rcb` + `apps/web/src/components/editor/canvas`. Keep this doc in sync when those constants change.

## Stack

| Layer | Role | Primary paths |
|-------|------|----------------|
| Stage shell | Camera, frames, product canvas | `editor/page/EditorStageWorld.tsx` |
| Camera / pan-zoom | Infinite world (`zoom` ~0.05–100); **CameraTransform** is the sole world↔screen API | `rcb/canvas/RcbCanvas.tsx`, `rcb/core/math.ts`, `rcb/camera/transform.ts` |
| SceneRenderer | Paint/hit backend (`svg` hosts + `canvas2d` underlay for grid + LOD proxies) | `rcb/render/sceneRenderer.ts` |
| Product canvas | Tools, media overlays, Redux writes; hit via SceneRenderer | `editor/canvas/SvgCanvas.tsx` |
| Shape paint | Per-node SVG hosts; LOD via `setSceneLodPaint` → stage Canvas (**transitional**) | `rcb/shapes/RcbShapesLayer.tsx`, `RcbShapeHost.tsx` |
| Pixel grid + LOD | Stage Canvas2D underlay (`[data-rcb-scene-canvas]`), camera baked | `RcbCanvas` + `createCanvasSceneRenderer` |
| Selection chrome | Shared scene SVG camera group for AABB, path silhouette, shape knobs, guides, and drawing previews; HTML overlay only for screen UI/hit seats | `rcb/selection/SelectionChrome.tsx`, `HostPathChrome.tsx`, chrome overlays |
| Transform gestures | `pointermove` → RAF-coalesced live preview into `TransformPreview` + transitional SVG DOM; `pointerup` commits SceneDocument and clears preview | `core/transformPreview.ts`, `SelectionFeature` coalescer, `canvasSession.onGeometryPreview/Commit` |
| Pointer hit | Overlay seats → chrome **geometry** → shared `SceneSpatialRuntime` → Path2D/AABB (SVG DOM off by default) | `pickSelectionInkAtClient`, `hitTestWithSpatialIndex`, `setSharedSceneSpatialRuntime` |
| Document model | Types + Zod | `rcb/sceneNode.ts`, `packages/scene-schema` |
| Mutations | normalize / stack / CRUD | `rcb/scene/document/sceneDocument.ts` |
| Live state | `document`, selection, tools | `store/modules/editor.ts` |
| Undo | COW / patch history | `store/modules/editorHistory.ts` |
| Collab | Yjs ↔ scene ↔ Redux | `editor/collab/sceneYBridge.ts`, `CollabRoomProvider.tsx` |

**Fact layer (ADR 0027):** `SceneDocument` + `CameraTransform` + `SceneSpatialRuntime`. SVG/`sceneToSvg` is export + transitional live paint — not the interaction substrate.

**Normative constraints (hit / camera / stress):** [ADR 0027 附录 A](./adr/0027-appendix-unified-hit-camera-stress.md) · [unified pipeline checklist](./canvas-unified-pipeline-checklist.md)

## Document shape

`SceneDocument` (see also [scene-json-spec.md](./scene-json-spec.md)):

- **`deltaSetLike`**: flat `id → SceneNode` map; `ROOT.children` (or page children) lists top-level nodes
- **`frames`**: **artboards** (fixed design plates). Not the camera **viewport**. Paint order unified in **`stackOrder`** (`frame:id` | `node:id`, bottom → top)
- Node fields: `id`, `key`, `x/y/width/height`, `attrs`, `children[]`

There is **no hard max node count** on the document. Capacity is governed by paint/hit budgets below.

## Paint model (what you see)

### Pixel grid → Canvas2D underlay

At ≥ `PIXEL_GRID_MIN_ZOOM` (~800%), `RcbCanvas` paints the lattice on a screen-space `[data-rcb-scene-canvas]` via `createCanvasSceneRenderer` / `drawSceneGrid` (camera baked into ctx; axes stay on `gℤ` — same as `snapCoordToGrid` / pen tips; do **not** device-shift axes off the snap lattice). SVG no longer carries the grid `<path>`. See [canvas-lattice-conversion-fix-plan.md](./canvas-lattice-conversion-fix-plan.md).

LOD overflow and **idle Canvas-capable nodes** (`canIdlePaintOnCanvas`: solid fill, **center** stroke, no shadow — rect·roundRect·circle·ellipse, line/arrow, light pen/path) are published by `RcbShapesLayer` through `setSceneLodPaint` and painted on the **same** stage underlay. Non-center `strokeAlign`, gradients, image/diffuse fills, heavy paths, text, polygons/stars, and **media plates** keep SVG hosts (or editor `forceFullSet`). There is no separate world-space `[data-rcb-lod-layer]` canvas.

### Committed ink → SVG hosts

Settled shapes/text/images paint as **per-node SVG hosts** (`RcbShapeHost`), ordered by `stackOrder`. Hosts, media `foreignObject`s, drawing previews, guides, and selection chrome all share one stage-sized SVG and one camera `<g>`. The CSS world layer and live host `left/top/viewBox` camera cancellation path were removed; do not restore either one.

#### Direct size edits and host notifications

- Width / height fields calculate one complete scene box (`left`, `top`, `width`, `height`), preview that exact box on the mounted SVG, then persist the same box in `SceneDocument`. A size edit never uses a centre-anchored preview followed by a top-left-anchored commit.
- A successfully previewed geometry edit must use `skipHostReload`; rebuilding a host after the DOM already has the final geometry causes a stale intermediate frame and desynchronizes selection chrome.
- `shapeHostRegistry` supports both global world-mount listeners and per-node listeners. Title chrome must subscribe by node id, not to every host event. Global subscriptions are reserved for a component that genuinely depends on the whole mount topology.
- Host jump diagnostics are development-only and bounded. Do not add unbounded arrays or console logging to pointer / remount paths.

### Title editing and history

Node and artboard titles are native-input edits: the browser owns the active input value and `onChange` writes the latest title immediately. The first character records the undo snapshot; subsequent characters use `skipHistory`, so one edit session is one undo step. A metadata-only name update must not reload SVG paint.

### Live drawing → SVG preview (not Path2D)

Pen, pencil, shape, and frame tools portal preview into a shared scene SVG mount (`getSceneDrawPreviewMount` in `shapeHostRegistry.ts`):

- **Pen / path edit** — SVG `<g>` preview (`PenDrawFeature`, `PenPathEditFeature`)
- **Pencil** — filled **SVG ribbon** outline from `outlinePathFromPoints` (`pencilBrushes.ts`); same lattice as commit. Comment in code: tip-stamp Canvas bake lagged/jittered; preview now matches commit SVG
- **Shape / frame draw** — SVG stroke/box preview portals

The former per-tool `RcbSceneOverlayCanvas` was removed. Live drawing portals into the shared camera group.

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
| Far / moving budgets | 24 / 56 | `zoom < LOD_ZOOM_FAR` (0.2) or moving+dense |
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
