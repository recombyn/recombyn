# ADR 0027: Scene + camera + layered render + independent hit

- **Status:** Accepted
- **Date:** 2026-08-15
- **Supersedes (partial):** [ADR 0002](./0002-canvas-rcb-runtime.md) runtime paint/hit coupling — RCB ownership stays; SVG is no longer the editor runtime fact layer.

## Context

RCB already owns `SceneDocument`, camera math (`rcb/core/math.ts`), and `SceneSpatialRuntime`. Live editing still couples **paint, hit-testing, and selection chrome** through SVG/DOM:

- One world layer drives SVG + HTML via CSS `translate + scale`.
- Selection chrome / path handles mirror host `viewBox` and use `1/zoom` counter-scale.
- Frequent `querySelector` / `getBoundingClientRect` / multi-surface z-index sync drifts under pan, zoom (5%–10_000%), and dense scenes.

SVG remains fine for export and moderate static paint. It must not remain the interaction and control-box substrate.

## Decision

Treat the editor runtime as four facts:

1. **`SceneDocument`** — unique document source of truth (Redux / collab patches write here).
2. **`CameraTransform`** — single pan/zoom matrix; only `worldToScreen` / `screenToWorld` / `screenDeltaToWorldDelta` on hot paths. No DOM “correction” of coordinates during gestures.
3. **Layered render** — ordinary ink → Canvas2D then WebGL; media / editing text → sparse DOM overlay; selection / guides / marquee → **screen-space** chrome overlay (not under world `scale`).
4. **Independent hit** — root pointer capture → chrome hit → spatial index coarse → precise geometry. `sceneToSvg` stays an **export / compat** path, not the live paint core.

### Delivery roadmap

| Status | Goal |
|--------|------|
| Done | CameraTransform API; screen-space selection chrome; RAF preview / commit on up; geometry-first chrome hit |
| Done | `SceneRenderer` (`svg` adapter + `canvas2d` underlay) |
| Done | Live ink on Canvas2D underlay: grid (DPR stroke snap), idle solid rect/ellipse (no stroke/shadow) |
| Done | `TransformPreview` store + `effectivePaintBox` — Canvas underlay follows gesture geometry; selected/editing ids `forceFull` SVG |
| Done | Context menu uses same `screenToScene` as selection + SVG host id fallback |
| Done | Overlay / collab / fly-to-chat screen mapping pass DPR; path-edit knobs hit at selection-chrome size |
| In progress | SVG remains for media / stroke / complex fills / editors; migrate chrome hit fully off DOM |
| Next | Canvas2D → WebGL behind the same renderer interface (atlas, dirty regions, batching) |

### Acceptance targets

- 10k light nodes pan at stable 60 FPS
- Pointer-move → paint P95 &lt; 16ms; single-point hit P95 &lt; 1ms
- Non-media DOM node count in the low hundreds
- Zoom 5%–10_000%: content / hit / chrome error ≤ 1 screen px
- Drag does not dispatch full Redux scene updates
- Export and screen share one `SceneDocument`, without depending on live DOM ink

## Consequences

### Positive

- Chrome handle size stays constant in screen px without `1/zoom` or viewBox twins.
- Hit and paint share one coordinate pipeline; fewer SVG lattice races.
- Can replace paint backend without rewriting selection / tools.

### Negative / trade-offs

- Dual paint paths (`SvgRenderer` + Canvas underlay) until migration completes.
- Contributors must not add new world-layer control SVG that mirrors host `viewBox`.

## Alternatives considered

1. **Keep SVG runtime, harden viewBox sync** — rejected; complexity grows with zoom and node count.
2. **Adopt an external whiteboard SDK** — rejected (ADR 0002); product artboards / agents / media stay in-house.
3. **Jump straight to WebGL** — rejected; stabilize camera + hit + chrome first.

## References

- [docs/canvas-architecture.md](../canvas-architecture.md)
- `apps/web/src/components/rcb/camera/transform.ts`
- `apps/web/src/components/rcb/render/sceneRenderer.ts`
- `apps/web/src/components/rcb/core/spatialIndex.ts`
- `apps/web/src/components/rcb/selection/SelectionChrome.tsx`
