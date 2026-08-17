import { useEffect, useRef, useState, memo } from 'react';
import { useRcbCamera } from '@/components/rcb/camera/context';
import { rcbCameraCssZoom } from '@/components/rcb/core/math';
import { applyFrameContentClip } from '@/components/rcb/frames/frameContentClip';
import {
  createSvgBoard,
  nodeToSvgElement,
} from '@/components/rcb/scene/paint/sceneToSvg';
import {
  blendModeToCss,
  parseBlendMode,
  parseLayerOpacity,
} from '@/components/rcb/selection/chrome/BlendModeControl';
import {
  getSceneShapesMount,
  getSceneWorldEpoch,
  getSceneWorldRoot,
  getSharedNodeEls,
  registerShapeHost,
  subscribeShapeHosts,
  syncSharedMountPaintOrder,
  unregisterShapeHost,
  updateShapeHostElement,
} from '@/components/rcb/shapes/shapeHostRegistry';
import type { SceneDocument } from '@/components/rcb/sceneNode';

function hostJumpLog(event: string, data: Record<string, unknown> = {}) {
  if (!import.meta.env.DEV) return;
  const row = { event, t: Math.round(performance.now()), ...data };
  const w = window as Window & {
    __rcbJumpLog?: unknown[];
    __rcbJumpDump?: () => string;
  };
  if (!Array.isArray(w.__rcbJumpLog)) w.__rcbJumpLog = [];
  w.__rcbJumpLog.push(row);
  if (w.__rcbJumpLog.length > 300) w.__rcbJumpLog.splice(0, w.__rcbJumpLog.length - 300);
  w.__rcbJumpDump = () => JSON.stringify(w.__rcbJumpLog, null, 2);
  console.info(JSON.stringify(row));
}

type Props = {
  nodeId: string;
  document: SceneDocument;
  /** Paint order among siblings (ROOT.children index). */
  zIndex: number;
  /** Bumps force a full remount / redraw of this host. */
  reloadToken?: number | string;
  /** Keep SVG paint invisible (inline text editor owns the glyphs). */
  forceHidden?: boolean;
};

/**
 * A geometry commit creates a new document shell, while every untouched node
 * keeps its object identity. Comparing the whole document here made every
 * mounted brush host render on each drag commit, which is costly enough for
 * dense stamped strokes to visibly shake. A host only needs its own node.
 */
export function shapeHostPropsEqual(previous: Props, next: Props): boolean {
  return (
    previous.nodeId === next.nodeId &&
    previous.zIndex === next.zIndex &&
    previous.reloadToken === next.reloadToken &&
    previous.forceHidden === next.forceHidden &&
    previous.document?.deltaSetLike?.[previous.nodeId] ===
      next.document?.deltaSetLike?.[next.nodeId]
  );
}

function setHostPaintOpacity(el: Element | null | undefined, hidden: boolean) {
  if (!el) return;
  const v = hidden ? '0' : '1';
  if (el instanceof HTMLElement || el instanceof SVGElement) {
    el.style.opacity = v;
  }
  el.setAttribute('opacity', v);
  const anyEl = el as any;
  if (typeof anyEl.opacity === 'function') anyEl.opacity(hidden ? 0 : 1);
}

/**
 * One paint host per scene node under the camera world layer.
 * Paints only in the shared scene SVG. A missing mount means this render waits
 * for the registry epoch instead of creating a second camera/viewBox pipeline.
 */
function RcbShapeHost({
  nodeId,
  document,
  zIndex,
  reloadToken = 0,
  forceHidden = false,
}: Props) {
  const camera = useRcbCamera();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<SVGGElement | null>(null);
  const bootRef = useRef(0);
  const forceHiddenRef = useRef(forceHidden);
  forceHiddenRef.current = forceHidden;
  const [worldEpoch, setWorldEpoch] = useState(() => getSceneWorldEpoch());
  useEffect(
    () =>
      subscribeShapeHosts(() => {
        setWorldEpoch((prev) => {
          const next = getSceneWorldEpoch();
          return prev === next ? prev : next;
        });
      }),
    []
  );
  const node = document?.deltaSetLike?.[nodeId];
  const blendMode = parseBlendMode(node?.attrs?.blendMode, { allowPassThrough: false });
  const layerOpacity = parseLayerOpacity(node?.attrs?.opacity, 1);
  const blendCss = blendModeToCss(blendMode);
  // Remount when stroke/fill paint attrs change — not on every geometry nudge.
  const paintToken = [
    node?.attrs?.hidden,
    node?.attrs?.locked,
    node?.attrs?.strokeAlign,
    node?.attrs?.['stroke-align'],
    node?.attrs?.['border-width'],
    node?.attrs?.strokeWidth,
    node?.attrs?.['border-color'],
    node?.attrs?.stroke,
    node?.attrs?.['stroke-opacity'],
    node?.attrs?.strokeStyle,
    node?.attrs?.strokeLinecap,
    node?.attrs?.['stroke-linecap'],
    node?.attrs?.strokeLinejoin,
    node?.attrs?.['stroke-linejoin'],
    node?.attrs?.['stroke-enabled'],
    node?.attrs?.['stroke-visible'],
    node?.attrs?.['fill-color'],
    node?.attrs?.['fill-type'],
    node?.attrs?.['fill-opacity'],
    node?.attrs?.['fill-enabled'],
    node?.attrs?.['fill-visible'],
    node?.attrs?.['fill-gradient'],
    node?.attrs?.['fill-image-src'],
    node?.attrs?.['fill-image-fit'],
    node?.attrs?.['fill-image-rotate'],
    node?.attrs?.['fill-image-adjust'],
    node?.attrs?.opacity,
    node?.attrs?.blendMode,
    node?.attrs?.brushStampSrc,
    node?.attrs?.markdown ?? node?.attrs?.DATA,
    node?.attrs?.fontSize,
    node?.attrs?.fontFamily,
    node?.attrs?.autoSize,
    node?.attrs?.path,
    node?.attrs?.shapeType,
    // Remount when rotation commits — chrome knobs mirror host transform; without
    // this, translate-only lag after angle commit leaves radius dots "跑路".
    node?.attrs?.angle,
    node?.attrs?.brushStyle,
    node?.attrs?.pathPressure,
    // All effects share the SVG paint path. Include their complete input so a
    // path/line/pen gets the same immediate repaint as an image or rect.
    node?.attrs?.['shadow-enabled'],
    node?.attrs?.['shadow-visible'],
    node?.attrs?.['shadow-color'],
    node?.attrs?.['shadow-x'],
    node?.attrs?.['shadow-y'],
    node?.attrs?.['shadow-blur'],
    node?.attrs?.['inner-shadow-enabled'],
    node?.attrs?.['inner-shadow-visible'],
    node?.attrs?.['inner-shadow-color'],
    node?.attrs?.['inner-shadow-x'],
    node?.attrs?.['inner-shadow-y'],
    node?.attrs?.['inner-shadow-blur'],
    node?.attrs?.['backdrop-blur-enabled'],
    node?.attrs?.['backdrop-blur-amount'],
    node?.attrs?.['backdrop-blur-brightness'],
    node?.attrs?.['blur-enabled'],
    node?.attrs?.['blur-amount'],
    // Empty generator / process hairlines are screen-constant (css/zoom) — remount on zoom.
    String(node?.attrs?.processStatus || '') === 'running' ||
    node?.attrs?.imageGenerator ||
    node?.attrs?.videoGenerator ||
    node?.attrs?.lottieGenerator ||
    node?.attrs?.audioGenerator
      ? rcbCameraCssZoom(camera).toFixed(3)
      : '',
    // Process placeholders (gradient upload/generate wash) are imperative SVG
    // paint. Include their position so an async status update cannot leave the
    // placeholder at the node's pre-move coordinates.
    String(node?.attrs?.processStatus || '') === 'running'
      ? `${Number(node?.x || 0)},${Number(node?.y || 0)}`
      : '',
  ].join('|');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !document) return undefined;

    const seq = ++bootRef.current;
    const n = document.deltaSetLike?.[nodeId];
    let cancelled = false;
    const sharedRoot = getSceneWorldRoot();
    const sharedMount = getSceneShapesMount();
    if (!sharedRoot || !sharedMount) return undefined;

    const { root, layer } = createSvgBoard(host, 1, 1, {
      infinite: true,
      sharedRoot,
      sharedMount,
    });
    layerRef.current = layer;
    layer.setAttribute('data-rcb-shape-id', nodeId);
    layer.setAttribute('data-z', String(zIndex));
    layer.style.opacity = forceHiddenRef.current ? '0' : String(layerOpacity);
    if (blendCss) layer.style.mixBlendMode = blendCss;
    else layer.style.removeProperty('mix-blend-mode');

    const nodeEls = getSharedNodeEls() || new Map();
    registerShapeHost({ nodeId, root, layer, el: null, kind: 'svg' });

    async function mountShape() {
      try {
        const el = await nodeToSvgElement(root, layer, document, n, nodeId);
        if (cancelled || bootRef.current !== seq) {
          try {
            el?.remove();
          } catch {
            /* ignore */
          }
          return;
        }
        if (el) {
          el.style.removeProperty('mix-blend-mode');
          el.style.opacity = '1';
          el.setAttribute('opacity', '1');
          if (forceHiddenRef.current) setHostPaintOpacity(el, true);
          applyFrameContentClip(root, el, document, n, { zoom: camera.zoom });
          const sharedMap = getSharedNodeEls();
          if (sharedMap) sharedMap.set(nodeId, el);
          else nodeEls.set(nodeId, el);
          updateShapeHostElement(nodeId, el);
        }
      } catch (err) {
        console.error('RcbShapeHost mount failed', nodeId, err);
      }
    }
    mountShape();

    return () => {
      cancelled = true;
      hostJumpLog('host.unmount', { nodeId, paintToken: String(paintToken).slice(0, 120) });
      unregisterShapeHost(nodeId);
      try {
        layer.remove();
      } catch {
        /* ignore */
      }
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, reloadToken, paintToken, worldEpoch]);

  // Toggle hide without remounting (enter / leave inline text edit).
  useEffect(() => {
    const el =
      getSharedNodeEls()?.get(nodeId) ||
      (hostRef.current?.querySelector?.('[data-scene-node-id]') as Element | null);
    setHostPaintOpacity(el, forceHidden);
    const layer = layerRef.current;
    if (layer) layer.style.opacity = forceHidden ? '0' : String(layerOpacity);
  }, [forceHidden, nodeId, paintToken, reloadToken, layerOpacity]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (blendCss) layer.style.mixBlendMode = blendCss;
    else layer.style.removeProperty('mix-blend-mode');
  }, [blendCss, paintToken]);

  // Keep SVG paint order ≈ document z (shapes + artboard plates interleaved).
  useEffect(() => {
    const layer = layerRef.current;
    const mount = getSceneShapesMount();
    if (!layer) return;
    layer.setAttribute('data-z', String(zIndex));
    if (!mount || layer.parentNode !== mount) return;
    syncSharedMountPaintOrder(mount);
  }, [zIndex, paintToken, worldEpoch]);

  return (
    <div
      ref={wrapRef}
      data-rcb-shape={nodeId}
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      style={{
        zIndex,
        // Shared-world paint lives in the scene SVG; wrap is a React anchor only.
        opacity: 1,
      }}
    >
      <div
        ref={hostRef}
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        data-rcb-shape-host={nodeId}
        style={{ width: 0, height: 0, overflow: 'visible' }}
      />
    </div>
  );
}

export default memo(RcbShapeHost, shapeHostPropsEqual);
