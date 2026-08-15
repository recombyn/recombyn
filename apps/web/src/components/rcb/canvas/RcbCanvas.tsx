import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  memo,
} from 'react';
import { cn } from '@/utils/classnames';
import {
  RcbCameraContext,
  RcbCameraMotionContext,
  RcbDevicePixelRatioContext,
  RcbOverlayRootContext,
  RcbViewportElContext,
} from '../camera/context';
import {
  installDprDebugHelpers,
  logDprCameraState,
} from '../core/dprDebug';
import { readDevicePixelRatio, subscribeDevicePixelRatio } from '../core/dpr';
import {
  rcbCameraCssZoom,
  rcbCameraScreenOffset,
  rcbClientToStageLocal,
  rcbFitCamera,
  rcbStepZoom,
  rcbZoomAtPoint,
} from '../core/math';
import { SceneSpatialRuntime } from '../core/spatialIndex';
import { RCB_DEFAULT_CAMERA, type RcbCamera } from '../core/types';
import {
  createCanvasSceneRenderer,
  getSceneLodPaint,
  listSceneLodPaintIds,
  subscribeSceneLodPaint,
  type SceneRenderer,
} from '../render/sceneRenderer';
import { subscribeTransformPreview } from '../core/transformPreview';
import type { SceneDocument } from '../sceneNode';
import {
  setInfiniteSvgPaintCamera,
  snapInfiniteSvgViewportToCamera,
  worldCameraViewport,
} from '../scene/paint/sceneToSvg';
import { listShapeHosts, notifyShapeHostGeometry, setSceneWorldRoot } from '../shapes/shapeHostRegistry';
import { DEFAULT_GRID_SIZE, shouldShowPixelGrid } from '../selection/alignGuides';

const EMPTY_SCENE_DOC: SceneDocument = {
  deltaSetLike: {
    ROOT: { id: 'ROOT', key: 'group', children: [] },
  },
} as SceneDocument;

export type { RcbCamera };
export { RCB_DEFAULT_CAMERA };

/**
 * Scene-space pixel-grid path (integer multiples of `g`).
 * Kept for tests / export helpers — live editor paints the grid on the
 * Canvas2D underlay (`createCanvasSceneRenderer`), not as SVG path ink.
 */
export function buildPixelGridPathD(
  left: number,
  top: number,
  width: number,
  height: number,
  gridSize: number
): string {
  const g = gridSize > 0 ? gridSize : 1;
  const right = left + Math.max(0, width);
  const bottom = top + Math.max(0, height);
  const x0 = Math.floor(left / g) * g;
  const y0 = Math.floor(top / g) * g;
  const parts: string[] = [];
  for (let x = x0; x <= right + 1e-9; x += g) {
    parts.push(`M ${x} ${y0} V ${bottom}`);
  }
  for (let y = y0; y <= bottom + 1e-9; y += g) {
    parts.push(`M ${x0} ${y} H ${right}`);
  }
  return parts.join(' ');
}

/** Zoom about a stage-local point — convenience for host zoom controls. */
export function zoomAtPoint(
  camera: RcbCamera,
  nextZoom: number,
  localX: number,
  localY: number
): RcbCamera {
  return rcbZoomAtPoint(camera, nextZoom, localX, localY);
}

export type RcbCanvasProps = {
  /**
   * Scene bounds used for one-shot autofit when `fitKey` changes.
   * Pass `{ width: 0, height: 0 }` to skip fit (empty document).
   */
  artboard: { x?: number; y?: number; width: number; height: number };
  camera: RcbCamera;
  onCameraChange: (next: RcbCamera) => void;
  /** Hand / space-pan mode. */
  panMode?: boolean;
  /** Select tool: left-drag on empty canvas starts pan after a short threshold. */
  emptyDragPans?: boolean;
  shouldBlockEmptyPan?: (e: PointerEvent) => boolean;
  /**
   * CSS selectors that block empty-canvas pan (selection chrome, etc.).
   * Host app supplies product-specific targets.
   */
  panBlockSelector?: string;
  className?: string;
  /** World-layer scene content (scaled with camera). */
  children: ReactNode;
  /** Optional SVG defs / ambient nodes inside the viewport (not scaled). */
  defs?: ReactNode;
  /**
   * Pixel-grid pitch in scene units (default 1). Auto-shows around ≥800% zoom.
   * Painted on the stage Canvas2D underlay (camera baked into ctx — not under
   * world CSS `scale`).
   */
  gridSize?: number;
  stageRef?: RefObject<HTMLDivElement | null>;
  /**
   * Fires whenever the live viewport node mounts/unmounts.
   * Hosts must use this (not a one-shot effect) so stageEl stays connected
   * after resize / mobile breakpoint remounts.
   */
  onViewportEl?: (el: HTMLElement | null) => void;
  cursor?: string;
  background?: string;
  /** Stable id for one-time autofit (e.g. document id). */
  fitKey?: string;
};

/**
 * RCB infinite canvas shell.
 *
 * Layers:
 *   1. Viewport — wheel / pan, overflow hidden
 *   2. Scene Canvas underlay — screen-space Canvas2D (grid + idle/LOD ink)
 *   3. World — CSS `translate + scale` (SVG/HTML content; chrome is overlay)
 *   4. Overlay — unscaled screen UI (selection chrome portals)
 *
 * Pixel grid uses CameraTransform on the underlay (same pan/zoom as ink), not
 * an SVG path under world `scale`.
 *
 * Camera never mutates scene coordinate origin. Shapes SVG grows with content
 * bounds (no fixed ±N plane) — unbounded page space.
 */
function RcbCanvas({
  artboard,
  camera,
  onCameraChange,
  panMode = false,
  emptyDragPans = false,
  shouldBlockEmptyPan,
  panBlockSelector = '',
  className,
  children,
  defs = null,
  gridSize = DEFAULT_GRID_SIZE,
  stageRef: stageRefProp,
  onViewportEl,
  cursor,
  background,
  fitKey,
}: RcbCanvasProps) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const stageRef = stageRefProp || localRef;
  const onViewportElRef = useRef(onViewportEl);
  onViewportElRef.current = onViewportEl;
  const cameraRef = useRef(camera);
  const panRef = useRef<{ x: number; y: number; scaleX: number; scaleY: number } | null>(null);
  const pendingPanRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const spaceDown = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraMoving, setCameraMoving] = useState(false);
  const emptyDragPansRef = useRef(emptyDragPans);
  const shouldBlockEmptyPanRef = useRef(shouldBlockEmptyPan);
  const panBlockSelectorRef = useRef(panBlockSelector);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const fittedKey = useRef('');
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null);
  const [devicePixelRatio, setDevicePixelRatio] = useState(() => readDevicePixelRatio());
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintRendererRef = useRef<SceneRenderer | null>(null);
  const gridSizeRef = useRef(gridSize);
  const [lodPaintEpoch, setLodPaintEpoch] = useState(0);

  cameraRef.current = camera;
  gridSizeRef.current = gridSize;

  const markCameraMoving = useCallback(() => {
    setCameraMoving(true);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setCameraMoving(false);
    }, 140);
  }, []);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  const cameraMotion = useMemo(
    () => ({
      moving: cameraMoving,
      efficientZoom: cameraMoving ? rcbStepZoom(camera.zoom) : camera.zoom,
    }),
    [cameraMoving, camera.zoom]
  );

  // Browser zoom / HiDPI — keep DPR in sync (camera pan snaps to this).
  useEffect(() => subscribeDevicePixelRatio(setDevicePixelRatio), []);

  // Opt-in camera logs: window.__RCB_DPR_DEBUG__ = true
  useEffect(() => {
    if (typeof window === 'undefined' || window.__RCB_DPR_DEBUG__ !== true) return;
    logDprCameraState({
      reason: 'camera-or-dpr',
      dpr: devicePixelRatio,
      camera,
      camCss: {
        ...rcbCameraScreenOffset(camera, devicePixelRatio),
        z: rcbCameraCssZoom(camera),
      },
    });
  }, [devicePixelRatio, camera]);

  // Console helpers: window.__rcbDumpDpr() / __rcbDumpGrid()
  useEffect(() => {
    installDprDebugHelpers(() => {
      const stage = stageRef.current;
      const boxes: Array<{
        id: string;
        left: number;
        top: number;
        width: number;
        height: number;
      }> = [];
      if (stage) {
        const nodes = stage.querySelectorAll<SVGElement>('[data-scene-node-id]');
        nodes.forEach((el) => {
          const id = el.getAttribute('data-scene-node-id') || '';
          if (!id) return;
          try {
            const bb = (el as SVGGraphicsElement).getBBox();
            boxes.push({
              id,
              left: bb.x,
              top: bb.y,
              width: bb.width,
              height: bb.height,
            });
          } catch {
            /* ignore detached */
          }
        });
      }
      return { dpr: devicePixelRatio, camera: cameraRef.current, boxes };
    });
  }, [devicePixelRatio, stageRef]);
  emptyDragPansRef.current = emptyDragPans;
  shouldBlockEmptyPanRef.current = shouldBlockEmptyPan;
  panBlockSelectorRef.current = panBlockSelector;
  const emptyWorld = !(artboard.width > 0 && artboard.height > 0);

  // Must be stable: a new ref callback every render makes React detach (null) +
  // reattach (node), which re-enters setState and hits max update depth (e.g. tour
  // opening Agent and re-layouting the stage).
  const setStageNode = useCallback((node: HTMLDivElement | null) => {
    if (stageRefProp) {
      (stageRefProp as { current: HTMLDivElement | null }).current = node;
    } else {
      localRef.current = node;
    }
    setViewportEl((prev) => (prev === node ? prev : node));
    onViewportElRef.current?.(node);
  }, [stageRefProp]);

  useEffect(() => {
    const key = fitKey || 'default';
    if (emptyWorld) {
      // Remember we opened empty so the first real artboard can still autofit.
      if (fittedKey.current !== key) fittedKey.current = `${key}:empty`;
      return;
    }
    // Already fitted for this key — skip. Do NOT treat `:empty` as fitted:
    // empty → first frame must run rcbFitCamera so content centers in the viewport.
    if (fittedKey.current === key) return;
    const el = stageRef.current || viewportEl;
    if (!el) return;
    let cancelled = false;
    let tries = 0;
    const applyFit = () => {
      if (cancelled) return;
      const stage = stageRef.current || viewportEl;
      if (!stage) return;
      const vw = stage.clientWidth;
      const vh = stage.clientHeight;
      if (vw < 40 || vh < 40) {
        // Stage not laid out yet — retry a few frames.
        if (tries++ < 30) requestAnimationFrame(applyFit);
        return;
      }
      fittedKey.current = key;
      // clientWidth/Height match camera.x/y layout space (not visual getBoundingClientRect).
      onCameraChange(rcbFitCamera({ width: vw, height: vh }, artboard));
    };
    applyFit();
    return () => {
      cancelled = true;
    };
  }, [fitKey, emptyWorld, artboard.x, artboard.y, artboard.width, artboard.height, onCameraChange, stageRef, viewportEl, artboard]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      ) {
        return;
      }
      if (e.repeat) return;
      spaceDown.current = true;
      setSpaceHeld(true);
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceDown.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;

    const isPanTool = () => panMode || spaceDown.current;

    const beginPan = (e: PointerEvent) => {
      pendingPanRef.current = null;
      e.preventDefault();
      e.stopPropagation();
      const local = rcbClientToStageLocal(el, e.clientX, e.clientY);
      panRef.current = { x: local.x, y: local.y, scaleX: local.scaleX, scaleY: local.scaleY };
      el.setPointerCapture?.(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const local = rcbClientToStageLocal(el, e.clientX, e.clientY);
      const cam = cameraRef.current;
      markCameraMoving();

      let deltaX = e.deltaX;
      let deltaY = e.deltaY;
      // Normalize line/page deltas so trackpads don't pan/zoom by huge jumps.
      if (e.deltaMode === 1) {
        deltaX *= 16;
        deltaY *= 16;
      } else if (e.deltaMode === 2) {
        deltaX *= el.clientWidth;
        deltaY *= el.clientHeight;
      }

      if (e.ctrlKey || e.metaKey) {
        onCameraChange(
          rcbZoomAtPoint(cam, cam.zoom * (deltaY > 0 ? 0.92 : 1.08), local.x, local.y)
        );
        return;
      }
      const sx = local.scaleX > 0 ? local.scaleX : 1;
      const sy = local.scaleY > 0 ? local.scaleY : 1;
      onCameraChange({
        ...cam,
        x: cam.x - deltaX / sx,
        y: cam.y - deltaY / sy,
      });
    };

    const onDown = (e: PointerEvent) => {
      if (e.button === 1 || isPanTool()) {
        beginPan(e);
        return;
      }
      if (e.button !== 0 || !emptyDragPansRef.current) return;
      const target = e.target as Element | null;
      const block = panBlockSelectorRef.current;
      if (block && target?.closest?.(block)) return;
      if (shouldBlockEmptyPanRef.current?.(e)) return;
      pendingPanRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    };
    const onMove = (e: PointerEvent) => {
      if (panRef.current) {
        const local = rcbClientToStageLocal(el, e.clientX, e.clientY);
        const dx = local.x - panRef.current.x;
        const dy = local.y - panRef.current.y;
        panRef.current = {
          x: local.x,
          y: local.y,
          scaleX: local.scaleX,
          scaleY: local.scaleY,
        };
        const cam = cameraRef.current;
        markCameraMoving();
        onCameraChange({ ...cam, x: cam.x + dx, y: cam.y + dy });
        return;
      }
      const pending = pendingPanRef.current;
      if (!pending || pending.pointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < 4) return;
      beginPan(e);
    };
    const onUp = (e: PointerEvent) => {
      pendingPanRef.current = null;
      if (!panRef.current) return;
      panRef.current = null;
      try {
        el.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown, { capture: true } as EventListenerOptions);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [panMode, onCameraChange, stageRef, markCameraMoving]);

  const panning = panMode || spaceHeld;

  // Re-assert after child tool effects (pen cleanup used to wipe style.cursor).
  useEffect(() => {
    const el = stageRef.current;
    if (!el || panning) return;
    el.style.cursor = cursor || '';
  }, [cursor, panning, stageRef]);

  // Snap pan to the device-pixel grid. Shape hosts share one camera world
  // viewport; the pixel lattice paints on the stage Canvas underlay.
  const { x: camX, y: camY } = rcbCameraScreenOffset(camera, devicePixelRatio);
  const camZ = rcbCameraCssZoom(camera);
  const stageW = viewportEl?.clientWidth || 0;
  const stageH = viewportEl?.clientHeight || 0;
  setInfiniteSvgPaintCamera(camera, devicePixelRatio, { width: stageW, height: stageH });
  const g = gridSize > 0 ? gridSize : DEFAULT_GRID_SIZE;
  const showPixelGrid = shouldShowPixelGrid(camZ);
  const worldVp = worldCameraViewport(camera, devicePixelRatio, stageW, stageH);
  const sceneLeft = worldVp?.left ?? -camX / camZ;
  const sceneTop = worldVp?.top ?? -camY / camZ;

  // Keep every host on the shared world viewport; bump chrome to re-mirror.
  useEffect(() => {
    setInfiniteSvgPaintCamera(camera, devicePixelRatio, {
      width: viewportEl?.clientWidth || 0,
      height: viewportEl?.clientHeight || 0,
    });
    for (const h of listShapeHosts()) {
      if (h.root) snapInfiniteSvgViewportToCamera(h.root, camera, devicePixelRatio);
    }
    notifyShapeHostGeometry();
  }, [camera, devicePixelRatio, viewportEl?.clientWidth, viewportEl?.clientHeight]);

  // One scene SVG for shape layers (grid lives on the Canvas underlay).
  const sceneRootRef = useRef<SVGSVGElement | null>(null);
  const shapesMountRef = useRef<SVGGElement | null>(null);
  const setSceneRootNode = useCallback((node: SVGSVGElement | null) => {
    sceneRootRef.current = node;
    const mount = node
      ? (node.querySelector(':scope > g[data-rcb-shapes-mount]') as SVGGElement | null)
      : null;
    const previewMount = node
      ? (node.querySelector(':scope > g[data-rcb-draw-preview-mount]') as SVGGElement | null)
      : null;
    const guidesMount = node
      ? (node.querySelector(':scope > g[data-rcb-smart-guides-mount]') as SVGGElement | null)
      : null;
    shapesMountRef.current = mount;
    setSceneWorldRoot(node, mount, previewMount, guidesMount);
  }, []);
  useEffect(() => {
    return () => setSceneWorldRoot(null, null, null, null);
  }, []);

  // Stage Canvas2D underlay — grid + LOD / idle proxies (ADR 0027).
  useEffect(() => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const spatial = new SceneSpatialRuntime(64);
    const renderer = createCanvasSceneRenderer({
      canvas,
      getDocument: () => getSceneLodPaint()?.document ?? EMPTY_SCENE_DOC,
      getSpatial: () => spatial,
      getZoom: () => rcbCameraCssZoom(cameraRef.current),
      listNodeIds: () => listSceneLodPaintIds(),
      getNodeBox: (id) => getSceneLodPaint()?.getNodeBox(id) ?? null,
      paintGrid: true,
      drawLodProxies: true,
      drawNodeProxies: false,
      drawBasicShapes: false,
      getGridSize: () => {
        const n = gridSizeRef.current;
        return n > 0 ? n : DEFAULT_GRID_SIZE;
      },
      shouldShowGrid: shouldShowPixelGrid,
    });
    paintRendererRef.current = renderer;
    return () => {
      renderer.dispose();
      paintRendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    return subscribeSceneLodPaint(() => {
      setLodPaintEpoch((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    return subscribeTransformPreview(() => {
      setLodPaintEpoch((n) => n + 1);
    });
  }, []);

  useLayoutEffect(() => {
    const renderer = paintRendererRef.current;
    if (!renderer || stageW <= 0 || stageH <= 0) return;
    const lodDoc = getSceneLodPaint()?.document ?? EMPTY_SCENE_DOC;
    renderer.render({
      document: lodDoc,
      camera,
      dirty: { kind: 'full' },
      stage: { width: stageW, height: stageH },
      dpr: devicePixelRatio,
    });
  }, [camera, devicePixelRatio, stageW, stageH, g, showPixelGrid, lodPaintEpoch]);

  // Sync shared scene root viewport whenever camera / stage / dpr changes.
  // Primitives (not `worldVp` object) — that helper returns a fresh object each render.
  const worldVpLeft = worldVp?.left;
  const worldVpTop = worldVp?.top;
  const worldVpWidth = worldVp?.width;
  const worldVpHeight = worldVp?.height;
  useEffect(() => {
    const root = sceneRootRef.current;
    if (
      !root ||
      worldVpLeft == null ||
      worldVpTop == null ||
      worldVpWidth == null ||
      worldVpHeight == null
    ) {
      return;
    }
    root.setAttribute('width', String(worldVpWidth));
    root.setAttribute('height', String(worldVpHeight));
    root.setAttribute('viewBox', `${worldVpLeft} ${worldVpTop} ${worldVpWidth} ${worldVpHeight}`);
    root.setAttribute('data-rcb-world-surface', '1');
    root.setAttribute('data-rcb-infinite', '1');
    root.style.left = `${worldVpLeft}px`;
    root.style.top = `${worldVpTop}px`;
    root.style.width = `${worldVpWidth}px`;
    root.style.height = `${worldVpHeight}px`;
  }, [worldVpLeft, worldVpTop, worldVpWidth, worldVpHeight]);

  return (
    <RcbCameraContext.Provider value={camera}>
      <RcbCameraMotionContext.Provider value={cameraMotion}>
      <RcbDevicePixelRatioContext.Provider value={devicePixelRatio}>
        <RcbViewportElContext.Provider value={viewportEl}>
          <RcbOverlayRootContext.Provider value={overlayEl}>
            <div
              ref={setStageNode}
              data-rcb-canvas="1"
              data-canvas-stage="1"
              data-rcb-dpr={String(devicePixelRatio)}
              className={cn(
                // Own pan/zoom/draw — block browser scroll/pinch so it cannot
                // fire pointercancel mid-gesture (common on tablet / DevTools device).
                'relative h-full w-full touch-none overflow-hidden select-none',
                !background && 'bg-[var(--canvas)]',
                panning && 'cursor-grab active:cursor-grabbing',
                // Tool cursors (eraser / pencil / …) inherit onto shapes — but
                // selection resize/rotate hits must keep their own cursors.
                !panning && cursor && '[&_*:not([data-sel-handle]):not([data-radius-handle]):not([data-star-handle]):not([data-poly-handle]):not([data-circle-handle])]:!cursor-inherit',
                !panning && !cursor && 'cursor-default',
                className
              )}
              style={{
                ...(background ? { background } : null),
                // Always set so leaving a tool clears any previous inline cursor.
                cursor: !panning && cursor ? cursor : '',
              }}
            >
              <style>{`
                /* HTML <video> paints; SVG poster is hit/export underlay only.
                   Hide on the live canvas so move cannot show a second layer.
                   Export builds its own SVG (no this rule). */
                [data-rcb-canvas] [data-rcb-video-svg-underlay="1"] { opacity: 0; }
              `}</style>
              {defs}
              {/* Screen-space Canvas underlay (grid + idle ink). Camera baked into ctx. */}
              <canvas
                ref={paintCanvasRef}
                aria-hidden
                data-rcb-scene-canvas="1"
                data-rcb-pixel-grid={showPixelGrid ? '1' : undefined}
                data-rcb-lod-count={String(listSceneLodPaintIds().length)}
                data-rcb-grid-size={String(g)}
                data-rcb-grid-left={String(Math.floor(sceneLeft / g) * g)}
                data-rcb-grid-top={String(Math.floor(sceneTop / g) * g)}
                className="pointer-events-none absolute inset-0 z-0"
              />
              {/* Infinite canvas world: camera CSS + scene SVG hosts (shapes). */}
              <div
                className="rcb-html-layer absolute left-0 top-0 z-[1] origin-top-left overflow-visible [&>*]:pointer-events-auto"
                data-rcb-world="1"
                data-rcb-html-layer="1"
                style={{
                  // Plain 2D translate (not translate3d): GPU float32 layers drift
                  // from Canvas2D / overlay math at 10000% and detach chrome / grid.
                  transform: `translate(${camX}px, ${camY}px) scale(${camZ})`,
                  // Screen-constant SVG chrome under camera scale (1/zoom).
                  ['--rcb-zoom' as string]: String(camZ),
                  ['--rcb-scale' as string]: `calc(1 / ${camZ})`,
                }}
              >
                {worldVp && worldVp.width > 0 && worldVp.height > 0 ? (
                  <svg
                    ref={setSceneRootNode}
                    aria-hidden
                    data-rcb-scene-root="1"
                    data-rcb-infinite="1"
                    data-rcb-world-surface="1"
                    data-rcb-scene-surface="1"
                    data-rcb-grid-size={String(g)}
                    className="pointer-events-none absolute z-0 overflow-visible"
                    width={worldVp.width}
                    height={worldVp.height}
                    viewBox={`${worldVp.left} ${worldVp.top} ${worldVp.width} ${worldVp.height}`}
                    preserveAspectRatio="none"
                    style={{
                      left: worldVp.left,
                      top: worldVp.top,
                      width: worldVp.width,
                      height: worldVp.height,
                      display: 'block',
                      overflow: 'visible',
                      shapeRendering: 'geometricPrecision',
                      pointerEvents: 'none',
                    }}
                  >
                    <g data-rcb-shapes-mount="1" />
                    <g data-rcb-draw-preview-mount="1" />
                    <g data-rcb-smart-guides-mount="1" />
                  </svg>
                ) : null}
                {children}
              </div>
              <div
                ref={setOverlayEl}
                data-rcb-overlay="1"
                className="pointer-events-none absolute inset-0 z-[20] overflow-visible"
              />
            </div>
          </RcbOverlayRootContext.Provider>
        </RcbViewportElContext.Provider>
      </RcbDevicePixelRatioContext.Provider>
      </RcbCameraMotionContext.Provider>
    </RcbCameraContext.Provider>
  );
}

export default memo(RcbCanvas);
