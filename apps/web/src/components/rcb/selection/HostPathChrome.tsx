import type { SceneNode, SceneNodeInput } from '@/components/rcb/sceneNode';
/**
 * Path indicator + path handles on screen overlay (ADR 0027).
 * Paint via CameraTransform; hit via geometry + world HTML pads — not host SVG pe.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRcbCamera, useRcbDevicePixelRatio } from '@/components/rcb/camera/context';
import { HEAVY_PATH_D_CHARS, rememberNodePath2D } from '@/components/rcb/scene/document/sceneShapes';
import { geometryIndicatorPathD } from '@/components/rcb/scene/paint/outlineToPath';
import {
  getShapeHost,
  getSharedNodeEls,
  listShapeHosts,
  subscribeShapeHosts,
} from '@/components/rcb/shapes/shapeHostRegistry';
import type { SceneBox } from './alignGuides';
import {
  CHROME_CORNER_L_ARM_PX,
  CHROME_CORNER_L_CLEAR_PX,
  CHROME_CORNER_L_THICK_PX,
  CHROME_HANDLE_HIT_PX,
  CHROME_HANDLE_VIS_PX,
  CHROME_LINE_ENDPOINT_HALO_PX,
  CHROME_LINE_ENDPOINT_VIS_PX,
  CHROME_STROKE_PX,
  chromeHitScaleForBox,
  chromeOverlayLayerRoot,
  clearChromeHitPads,
  cornerLLocalPath,
  cursorForResize,
  disposeLegacyHitPadLayer,
  liveHostPaintOrigin,
  mountChromeHitPad,
  screenChromeBodyTransform,
  strokeOuterForRotateLScene,
} from './SelectionChrome';
import { cursorForRotate } from './rotateCornerCursor';
import type { RcbCamera } from '@/components/rcb/core/types';
import { rcbCameraCssZoom } from '@/components/rcb/core/math';

function liveNodeEl(nodeId: string): Element | null {
  // Prefer the live shape host — shared map can lag one frame after draw/remount
  // and at high zoom that desyncs paint vs pick.
  return (
    (getShapeHost(nodeId)?.el as Element | null | undefined) ||
    (getSharedNodeEls()?.get(nodeId) as Element | undefined) ||
    null
  );
}

/** Live geometry from the mounted shape host (same numbers paint uses). */
function liveShapeGeomBox(nodeId: string): SceneBox | null {
  const el = liveNodeEl(nodeId) as (SVGElement & {
    __sceneLeft?: number;
    __sceneTop?: number;
    sceneWidth?: number;
    sceneHeight?: number;
  }) | null;
  if (!el) return null;
  const origin = liveHostPaintOrigin(el);
  const width = Number(el.sceneWidth);
  const height = Number(el.sceneHeight);
  if (!origin || ![width, height].every(Number.isFinite)) return null;
  if (!(width > 0) || !(height > 0)) return null;
  return { left: origin.left, top: origin.top, width, height };
}

/** Shape / image / video / lottie / path on SVG host (not text / frame). */
function nodeUsesPathChrome(node: SceneNodeInput): boolean {
  if (!node) return false;
  const key = String(node.key || '');
  if (key === 'text' || key === 'frame') return false;
  // Media / vector plates use path chrome so the silhouette tracks live host geom.
  if (key === 'image' || key === 'video' || key === 'lottie' || key === 'audio') return true;
  if (key === 'shape' || key === 'path' || key === 'rect' || key === 'ellipse') return true;
  return Boolean(node.attrs?.shapeType);
}

export type ShapeOutlineItem = {
  id: string;
  pathD: string;
  box: SceneBox;
  angle: number;
  color?: string;
  /** Selected: inject resize (and rotate) hits into the host with the outline. */
  withHandles?: boolean;
  lineMode?: boolean;
  /** Line/arrow: knobs at shaft ends (not path tip). */
  shaftEndpoints?: boolean;
  showRotate?: boolean;
  /** When false, handles/edges only. */
  showPath?: boolean;
  /** Multi-select union control box; mirrors `mirrorHostId` viewport. */
  unionChrome?: boolean;
  mirrorHostId?: string;
  cornerHandlesOnly?: boolean;
  edgeHandles?: 'all' | 'horizontal' | 'none';
  /**
   * Pad from geom-local origin to control box (≥ 0). Normally 0 — box on path.
   */
  chromeOutset?: number;
  /**
   * Past outer stroke edge (scene). Rotate = screen gap + this — same at any zoom.
   */
  strokeOuterScene?: number;
};

const SVG_NS = 'http://www.w3.org/2000/svg' as const;
const SEL_OUTLINE_ATTR = 'data-rcb-sel-outline';
const SEL_CHROME_ATTR = 'data-rcb-sel-chrome';
/** Legacy host AABB box attr — cleaned on sync; path silhouette is the outline. */
const SEL_BOX_ATTR = 'data-rcb-sel-box';
/** Inspect pair top/bottom (or L/R) edge rails — host-injected. */
const SEL_EDGE_ATTR = 'data-rcb-sel-edge';
/** Gap / size badge pill — host-injected. */
const SEL_BADGE_ATTR = 'data-rcb-sel-badge';
/** World-layer mount for path chrome (above shape hosts; does not lift node ink). */
const SEL_CHROME_LAYER_ATTR = 'data-rcb-sel-chrome-layer';
const SEL_EP_HOVER_STYLE = 'g.sel-hit:hover > .sel-ep-halo { opacity: 1; }';

/**
 * Screen-overlay chrome mount (ADR 0027). Paint only;
 * pointer-events stay none — hits via geometry / world HTML pads.
 */
export function selChromeLayerShell(): {
  className: string;
  width: string;
  height: string;
  zIndex: string;
  pointerEvents: 'none';
} {
  return {
    className: 'pointer-events-none absolute inset-0 overflow-visible',
    width: '100%',
    height: '100%',
    zIndex: '18',
    pointerEvents: 'none',
  };
}

function ensureSelEpHoverStyle(root: SVGSVGElement) {
  if (root.querySelector('style[data-rcb-sel-ep-style]')) return;
  const style = document.createElementNS(SVG_NS, 'style');
  style.setAttribute('data-rcb-sel-ep-style', '1');
  style.textContent = SEL_EP_HOVER_STYLE;
  root.insertBefore(style, root.firstChild);
}

/** Local (box) → world, matching host chrome rotate-about-center. */
function localPointToWorld(
  lx: number,
  ly: number,
  box: SceneBox,
  angleDeg: number,
  hostEl?: SVGElement | null
): { x: number; y: number } {
  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const cx = w / 2;
  const cy = h / 2;
  const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = lx - cx;
  const dy = ly - cy;
  // Prefer live host origin (same as hostChromeBodyTransform / liveHostPaintOrigin)
  // so hit pads stay under painted knobs after high-zoom sticky re-align.
  const origin = liveHostPaintOrigin(hostEl);
  const left = origin ? origin.left : box.left;
  const top = origin ? origin.top : box.top;
  return {
    x: left + cx + dx * cos - dy * sin,
    y: top + cy + dx * sin + dy * cos,
  };
}

/** Place AABB so local point maps to a world point under `angleDeg`. */
function boxFromLocalAnchor(
  localX: number,
  localY: number,
  worldX: number,
  worldY: number,
  width: number,
  height: number,
  angleDeg: number
): SceneBox {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const cx = w / 2;
  const cy = h / 2;
  const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = localX - cx;
  const dy = localY - cy;
  const centerX = worldX - (dx * cos - dy * sin);
  const centerY = worldY - (dx * sin + dy * cos);
  return { left: centerX - cx, top: centerY - cy, width: w, height: h };
}

/**
 * Host selection chrome mount on the screen overlay (ADR 0027).
 * Paint only — SelectionFeature owns hits via geometry / world pads.
 */
function ensureSelChromeLayer(): HTMLElement | null {
  return chromeOverlayLayerRoot();
}

function ensureScreenChromeSvg(
  layer: HTMLElement,
  chromeId: string
): SVGSVGElement {
  // Drop legacy scene-SVG `g` chrome roots.
  layer
    .querySelectorAll(`:scope > g[${SEL_CHROME_ATTR}="${CSS.escape(chromeId)}"]`)
    .forEach((n) => {
      try {
        n.remove();
      } catch {
        /* ignore */
      }
    });

  let root = layer.querySelector(
    `:scope > svg[${SEL_CHROME_ATTR}="${CSS.escape(chromeId)}"]`
  ) as SVGSVGElement | null;
  if (!root) {
    root = document.createElementNS(SVG_NS, 'svg');
    root.setAttribute(SEL_CHROME_ATTR, chromeId);
    root.setAttribute('data-rcb-screen-chrome', '1');
    root.setAttribute('overflow', 'visible');
    root.style.position = 'absolute';
    root.style.left = '0';
    root.style.top = '0';
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.overflow = 'visible';
    root.style.pointerEvents = 'none';
    root.style.display = 'block';
    layer.appendChild(root);
  }
  root.style.pointerEvents = 'none';
  root.removeAttribute('viewBox');
  root.removeAttribute('width');
  root.removeAttribute('height');
  root.removeAttribute('data-rcb-world-chrome');
  root.setAttribute('data-rcb-screen-chrome', '1');
  root.style.left = '0';
  root.style.top = '0';
  root.style.width = '100%';
  root.style.height = '100%';
  return root;
}

/** Fingerprint for resize/rotate DOM — skip tear-down when only camera pan updates. */
function hostSelHandlesKey(
  o: ShapeOutlineItem,
  stroke: number,
  inv: number,
  outlineD: string
): string {
  // Live host lattice (not Redux alone) — at 5000%+ even 0.01 scene is a screen px.
  const live = liveShapeGeomBox(o.id);
  const origin = liveHostPaintOrigin(liveNodeEl(o.id));
  const left = live?.left ?? origin?.left ?? o.box.left;
  const top = live?.top ?? origin?.top ?? o.box.top;
  const width = live?.width ?? o.box.width;
  const height = live?.height ?? o.box.height;
  return [
    o.withHandles ? 1 : 0,
    o.showRotate ? 1 : 0,
    o.lineMode ? 1 : 0,
    o.shaftEndpoints ? 1 : 0,
    o.cornerHandlesOnly ? 1 : 0,
    o.edgeHandles || 'all',
    o.color || '',
    stroke.toFixed(5),
    inv.toFixed(6),
    left.toFixed(4),
    top.toFixed(4),
    width.toFixed(4),
    height.toFixed(4),
    (Number(o.angle) || 0).toFixed(3),
    Number(o.chromeOutset) || 0,
    Number(o.strokeOuterScene) || 0,
    outlineD.length,
    outlineD.slice(0, 32),
    outlineD.slice(-32),
  ].join('|');
}

function syncHostSelHandlesIfNeeded(
  chrome: SVGGElement,
  o: ShapeOutlineItem,
  stroke: number,
  inv: number,
  outlineD: string,
  camera: RcbCamera,
  dpr?: number
) {
  const key = hostSelHandlesKey(o, stroke, inv, outlineD);
  if (!o.withHandles) {
    if (chrome.getAttribute('data-rcb-handles-key')) {
      chrome
        .querySelectorAll(
          `g.sel-hit,[data-sel-handle],[data-rcb-sel-knob],[data-rcb-sel-rotate-l],[${SEL_BOX_ATTR}]`
        )
        .forEach((n) => n.remove());
      chrome.removeAttribute('data-rcb-handles-key');
    }
    return;
  }
  if (chrome.getAttribute('data-rcb-handles-key') === key) return;
  syncHostSelHandles(chrome, o, stroke, inv, outlineD, camera, dpr);
  chrome.setAttribute('data-rcb-handles-key', key);
}

function clearHostSelOutline(nodeId: string) {
  clearChromeHitPads(`sel-chrome:${nodeId}`);
  const host = getShapeHost(nodeId);
  const el = host?.el || getSharedNodeEls()?.get(nodeId);
  const scopes: Array<Element | null | undefined> = [
    el,
    host?.root,
    el?.parentElement,
    typeof document !== 'undefined'
      ? document.querySelector(`[${SEL_CHROME_LAYER_ATTR}]`)
      : null,
  ];
  const edgeForSel = `g[data-rcb-sel-edge-for="${CSS.escape(nodeId)}"]`;
  for (const scope of scopes) {
    if (!scope || typeof scope.querySelectorAll !== 'function') continue;
    scope
      .querySelectorAll(
        `[${SEL_OUTLINE_ATTR}="${CSS.escape(nodeId)}"],[${SEL_CHROME_ATTR}="${CSS.escape(nodeId)}"],[${SEL_EDGE_ATTR}="${CSS.escape(nodeId)}"],[${SEL_BADGE_ATTR}="${CSS.escape(nodeId)}"],${edgeForSel}`
      )
      .forEach((n) => {
        try {
          n.remove();
        } catch {
          /* ignore */
        }
      });
  }
}

function readBaselinePathD(baseline: SVGElement | null, fallback: string): string {
  if (!baseline) return fallback;
  const tag = baseline.tagName.toLowerCase();
  if (tag === 'path') {
    const d = baseline.getAttribute('d') || '';
    return d.trim().length >= 2 ? d : fallback;
  }
  if (tag === 'line') {
    const x1 = Number(baseline.getAttribute('x1') || 0);
    const y1 = Number(baseline.getAttribute('y1') || 0);
    const x2 = Number(baseline.getAttribute('x2') || 0);
    const y2 = Number(baseline.getAttribute('y2') || 0);
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  return fallback;
}

/** Keep first subpath only (donut outer). */
function silhouettePathD(d: string): string {
  const raw = String(d || '').trim();
  if (!raw) return raw;
  // Each M/m starts a subpath; keep only the first (outer).
  const parts = raw.match(/[Mm][^Mm]*/g);
  if (!parts || parts.length <= 1) return raw;
  return parts[0].trim();
}

/** Path chrome `d` — prefer live host baseline, else attrs path; single contour. */
function readHostOutlinePathD(baseline: SVGElement | null, o: ShapeOutlineItem): string {
  return silhouettePathD(readBaselinePathD(baseline, o.pathD));
}

function pathLocalEndpoints(
  d: string,
  w: number,
  h: number,
  mode: 'path' | 'shaft' = 'path'
): [[number, number], [number, number]] {
  const midY = h / 2;
  const fallback: [[number, number], [number, number]] = [
    [0, midY],
    [Math.max(1, w), midY],
  ];
  if (mode === 'shaft') return fallback;
  const raw = String(d || '').trim();
  if (!raw || typeof document === 'undefined') return fallback;
  try {
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('d', raw);
    const len = el.getTotalLength?.() ?? 0;
    if (!(len > 0)) return fallback;
    const a = el.getPointAtLength(0);
    const b = el.getPointAtLength(len);
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return fallback;
    return [
      [a.x, a.y],
      [b.x, b.y],
    ];
  } catch {
    return fallback;
  }
}

/** Line / arrow only — shaft endpoint knobs. Pen / pencil / path use AABB control box. */
function nodeUsesOpenStrokeEndpoints(node: SceneNodeInput): boolean {
  if (!node) return false;
  const t = String(node.attrs?.shapeType || '');
  return t === 'line' || t === 'arrow';
}

/** Freehand / boolean / stroke paths that must show real path ink as object outline. */
export function isVectorStrokeNode(node: SceneNodeInput, shapeType?: string): boolean {
  const t = shapeType ?? String(node?.attrs?.shapeType || '');
  return (
    t === 'pencil' ||
    t === 'pen' ||
    t === 'path' ||
    t === 'line' ||
    t === 'arrow' ||
    String(node?.key || '') === 'path' ||
    nodeUsesOpenStrokeEndpoints(node)
  );
}

/**
 * Object-outline path `d` in local geom space (HostPathChrome silhouette).
 * Vector strokes always use painted path; heavy geo falls back to AABB stand-in.
 */
export function resolveOutlinePathD(node: SceneNodeInput, gw: number, gh: number): string {
  const rawPath = String(node?.attrs?.path || node?.attrs?.d || '');
  const shapeType = String(node?.attrs?.shapeType || '');
  if (isVectorStrokeNode(node, shapeType)) {
    if (rawPath.trim().length >= 2) return rawPath;
    return geometryIndicatorPathD(node, { width: gw, height: gh });
  }
  if (rawPath.length >= HEAVY_PATH_D_CHARS) {
    return `M 0 0 H ${gw} V ${gh} H 0 Z`;
  }
  return geometryIndicatorPathD(node, { width: gw, height: gh });
}

type BoxResizeKnob = ['n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw', number, number];

/** Control-box resize seats for the given edge/corner policy. */
function boxResizeKnobs(
  bx: number,
  by: number,
  bw: number,
  bh: number,
  opts: { cornerHandlesOnly?: boolean; edgeHandles?: 'all' | 'horizontal' | 'none' }
): BoxResizeKnob[] {
  if (opts.cornerHandlesOnly) {
    return [
      ['nw', bx, by],
      ['ne', bx + bw, by],
      ['se', bx + bw, by + bh],
      ['sw', bx, by + bh],
    ];
  }
  if (opts.edgeHandles === 'horizontal') {
    return [
      ['w', bx, by + bh / 2],
      ['e', bx + bw, by + bh / 2],
    ];
  }
  return [
    ['nw', bx, by],
    ['n', bx + bw / 2, by],
    ['ne', bx + bw, by],
    ['e', bx + bw, by + bh / 2],
    ['se', bx + bw, by + bh],
    ['s', bx + bw / 2, by + bh],
    ['sw', bx, by + bh],
    ['w', bx, by + bh / 2],
  ];
}

function syncHostSelHandles(
  chrome: SVGGElement,
  o: ShapeOutlineItem,
  stroke: number,
  inv: number,
  outlineD: string,
  camera: RcbCamera,
  dpr?: number
) {
  // Drop previous handle/rotate/box (keep path silhouette outline).
  chrome
    .querySelectorAll(
      `g.sel-hit,[data-sel-handle],[data-rcb-sel-knob],[data-rcb-sel-rotate-l],[${SEL_BOX_ATTR}]`
    )
    .forEach((n) => n.remove());

  const handleVis = CHROME_HANDLE_VIS_PX * inv;
  const halfVis = handleVis / 2;
  const lineEpVis = CHROME_LINE_ENDPOINT_VIS_PX * inv;
  const angle = Number(o.angle) || 0;
  const color = o.color || '#3388ff';
  // Same lattice as hostChromeBodyTransform / pick — never Redux alone after sticky zoom.
  const live = liveShapeGeomBox(o.id);
  const w = Math.max(1, live?.width ?? o.box.width);
  const h = Math.max(1, live?.height ?? o.box.height);

  if (o.lineMode) {
    const [start, end] = pathLocalEndpoints(
      outlineD,
      w,
      h,
      o.shaftEndpoints ? 'shaft' : 'path'
    );
    const knobs: Array<[string, number, number]> = [
      ['w', start[0], start[1]],
      ['e', end[0], end[1]],
    ];
    const lineEpHalo = CHROME_LINE_ENDPOINT_HALO_PX * inv;
    const root = chrome.ownerSVGElement as SVGSVGElement | null;
    if (root) ensureSelEpHoverStyle(root);
    for (const [dir, lx, ly] of knobs) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'sel-hit');
      g.setAttribute('transform', `translate(${lx} ${ly})`);

      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('class', 'sel-ep-halo');
      halo.setAttribute('r', String(lineEpHalo / 2));
      halo.setAttribute('fill', `${color}59`);
      halo.setAttribute('opacity', '0');
      halo.setAttribute('pointer-events', 'none');
      g.appendChild(halo);

      const vis = document.createElementNS(SVG_NS, 'circle');
      vis.setAttribute('data-rcb-sel-knob', dir);
      vis.setAttribute('data-rcb-sel-endpoint', dir);
      vis.setAttribute('r', String(Math.max(0.01, lineEpVis / 2 - stroke / 2)));
      vis.setAttribute('fill', '#fff');
      vis.setAttribute('stroke', color);
      vis.setAttribute('stroke-width', String(stroke));
      // Same SVG element for ink + hit.
      vis.setAttribute('pointer-events', 'none');
      g.appendChild(vis);

      chrome.appendChild(g);
    }
    syncHostSelHitPads(o, camera, dpr, 0, 0, w, h, knobs);
    return;
  }

  const outset = Math.max(0, Number(o.chromeOutset) || 0);
  const bx = -outset;
  const by = -outset;
  const bw = w + outset * 2;
  const bh = h + outset * 2;
  const box = document.createElementNS(SVG_NS, 'rect');
  box.setAttribute(SEL_BOX_ATTR, o.id);
  box.setAttribute('x', String(bx));
  box.setAttribute('y', String(by));
  box.setAttribute('width', String(bw));
  box.setAttribute('height', String(bh));
  box.setAttribute('fill', 'none');
  box.setAttribute('stroke', color);
  box.setAttribute('stroke-width', String(stroke));
  box.setAttribute('pointer-events', 'none');
  chrome.appendChild(box);

  const edgeMode = o.edgeHandles || 'all';
  if (edgeMode === 'none') return;

  const knobs = boxResizeKnobs(bx, by, bw, bh, {
    cornerHandlesOnly: o.cornerHandlesOnly,
    edgeHandles: edgeMode,
  });

  const isCorner = (d: string) => d === 'nw' || d === 'ne' || d === 'se' || d === 'sw';
  const orderedKnobs = [
    ...knobs.filter(([d]) => !isCorner(d)),
    ...knobs.filter(([d]) => isCorner(d)),
  ];

  const z = Math.max(0.05, 1 / Math.max(1e-6, inv));
  const hitScale = chromeHitScaleForBox(bw, bh, z);
  const hs = Math.max(0.35, hitScale);
  const lArm = CHROME_CORNER_L_ARM_PX * inv * hs;
  const lThick = CHROME_CORNER_L_THICK_PX * inv * hs;
  const strokeOuter = strokeOuterForRotateLScene(Number(o.strokeOuterScene) || 0, z);
  const lClear = halfVis + CHROME_CORNER_L_CLEAR_PX * inv * hs + strokeOuter;

  if (o.showRotate) {
    for (const dir of ['nw', 'ne', 'se', 'sw'] as const) {
      const d = cornerLLocalPath(dir, bw, bh, lArm, lThick, lClear);
      if (!d) continue;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('data-rcb-sel-rotate-l', dir);
      if (bx !== 0 || by !== 0) {
        path.setAttribute('transform', `translate(${bx} ${by})`);
      }
      path.setAttribute('d', d);
      path.setAttribute('fill', color);
      path.setAttribute('pointer-events', 'none');
      chrome.appendChild(path);
    }
  }

  for (const [dir, lx, ly] of orderedKnobs) {
    const visFill = document.createElementNS(SVG_NS, 'rect');
    visFill.setAttribute('data-rcb-sel-knob', dir);
    visFill.setAttribute('x', String(lx - halfVis));
    visFill.setAttribute('y', String(ly - halfVis));
    visFill.setAttribute('width', String(handleVis));
    visFill.setAttribute('height', String(handleVis));
    visFill.setAttribute('fill', '#ffffff');
    visFill.setAttribute('pointer-events', 'none');
    chrome.appendChild(visFill);

    const visStroke = document.createElementNS(SVG_NS, 'rect');
    visStroke.setAttribute('data-rcb-sel-knob', dir);
    visStroke.setAttribute('x', String(lx - halfVis));
    visStroke.setAttribute('y', String(ly - halfVis));
    visStroke.setAttribute('width', String(handleVis));
    visStroke.setAttribute('height', String(handleVis));
    visStroke.setAttribute('fill', 'none');
    visStroke.setAttribute('stroke', color);
    visStroke.setAttribute('stroke-width', String(stroke));
    visStroke.setAttribute('pointer-events', 'none');
    chrome.appendChild(visStroke);
  }

  syncHostSelHitPads(o, camera, dpr, bx, by, bw, bh, orderedKnobs);
}

/** Scene-space HTML pads for painted knobs (host SVG pe must not own hits). */
function syncHostSelHitPads(
  o: ShapeOutlineItem,
  camera: RcbCamera,
  dpr: number | undefined,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  knobs: Array<[string, number, number]>
) {
  const ownerId = `sel-chrome:${o.id}`;
  clearChromeHitPads(ownerId);
  if (!o.withHandles) return;
  const hostEl = (getShapeHost(o.id)?.el || getSharedNodeEls()?.get(o.id)) as
    | SVGElement
    | null
    | undefined;
  const angle = Number(o.angle) || 0;
  const z = Math.max(0.05, rcbCameraCssZoom(camera));
  const hitScale = chromeHitScaleForBox(bw, bh, z);
  const hs = Math.max(0.35, hitScale);
  const sizePx = CHROME_HANDLE_HIT_PX * hs;
  const origin = liveHostPaintOrigin(hostEl) || { left: o.box.left, top: o.box.top };
  const rad = ((angle || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = Math.max(1, o.box.width) / 2;
  const cy = Math.max(1, o.box.height) / 2;

  function localToScene(lx: number, ly: number) {
    const dx = lx - cx;
    const dy = ly - cy;
    return {
      x: origin.left + cx + dx * cos - dy * sin,
      y: origin.top + cy + dx * sin + dy * cos,
    };
  }

  for (const [dir, lx, ly] of knobs) {
    const p = localToScene(lx, ly);
    mountChromeHitPad({
      ownerId,
      zoneKey: `resize-${dir}`,
      sizePx,
      cursor: cursorForResize(dir as 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw', angle),
      sceneX: p.x,
      sceneY: p.y,
      camera,
      dpr,
      knobDir: dir,
    });
  }

  if (o.showRotate) {
    for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
      const lx = corner === 'ne' || corner === 'se' ? bx + bw : bx;
      const ly = corner === 'se' || corner === 'sw' ? by + bh : by;
      const p = localToScene(lx, ly);
      mountChromeHitPad({
        ownerId,
        zoneKey: `rotate-${corner}`,
        sizePx: sizePx * 1.15,
        cursor: cursorForRotate(
          corner === 'nw' ? 0 : corner === 'ne' ? 90 : corner === 'se' ? 180 : 270,
          angle
        ),
        sceneX: p.x,
        sceneY: p.y,
        camera,
        dpr,
        rotateCorner: corner,
        dashed: true,
      });
    }
  }
}

/** Multi-select union control box on the screen overlay. */
function syncHostSelUnionChrome(
  o: ShapeOutlineItem,
  stroke: number,
  inv: number,
  camera: RcbCamera,
  dpr?: number
): boolean {
  const layer = ensureSelChromeLayer();
  if (!layer) return false;

  const w = Math.max(1, o.box.width);
  const h = Math.max(1, o.box.height);
  const root = ensureScreenChromeSvg(layer, o.id);

  let chrome = root.querySelector(`:scope > g[${SEL_CHROME_ATTR}="body"]`) as SVGGElement | null;
  if (!chrome) {
    chrome = document.createElementNS(SVG_NS, 'g');
    chrome.setAttribute(SEL_CHROME_ATTR, 'body');
    chrome.setAttribute('pointer-events', 'none');
    root.appendChild(chrome);
  }
  const angle = Number(o.angle) || 0;
  const mirrorId = o.mirrorHostId || o.id;
  const hostEl = (getShapeHost(mirrorId)?.el || getSharedNodeEls()?.get(mirrorId)) as
    | SVGElement
    | null
    | undefined;
  chrome.setAttribute(
    'transform',
    screenChromeBodyTransform(hostEl, o.box, angle, camera, dpr ?? 1)
  );
  syncHostSelHandlesIfNeeded(chrome, o, stroke, inv, '', camera, dpr);
  return true;
}

/**
 * Blue path outline (+ handles) on the screen overlay (ADR 0027).
 * Body uses live host origin; path `d` stays in scene-local units.
 */
function syncHostSelOutline(
  o: ShapeOutlineItem,
  stroke: number,
  inv: number,
  camera: RcbCamera,
  dpr?: number
): boolean {
  if (o.unionChrome) return syncHostSelUnionChrome(o, stroke, inv, camera, dpr);

  const layer = ensureSelChromeLayer();
  if (!layer) return false;

  const host = getShapeHost(o.id);
  const el = (host?.el || getSharedNodeEls()?.get(o.id)) as SVGElement | null | undefined;
  const baseline = el
    ? (el.getAttribute?.('data-baseline') === '1' ? el : null) ||
      (el.querySelector?.(':scope > [data-baseline="1"]') as SVGElement | null) ||
      (el.querySelector?.('[data-baseline="1"]') as SVGElement | null)
    : null;

  const d = readHostOutlinePathD(baseline, o);
  if (!d) {
    clearHostSelOutline(o.id);
    return false;
  }

  // Strip any leftover chrome still injected inside the shape host / world layer.
  if (el) {
    const hostParent =
      (baseline?.parentElement as Element | null) ||
      (el.tagName.toLowerCase() === 'g' ? el : el.parentElement);
    hostParent
      ?.querySelectorAll?.(
        `[${SEL_OUTLINE_ATTR}="${CSS.escape(o.id)}"],[${SEL_CHROME_ATTR}="${CSS.escape(o.id)}"]`
      )
      .forEach((n) => {
        try {
          n.remove();
        } catch {
          /* ignore */
        }
      });
  }
  // Migrate: drop stale overlay / nested-svg screen-chrome twins.
  document
    .querySelectorAll(
      `[data-rcb-overlay="1"] [data-rcb-sel-chrome-layer] svg[${SEL_CHROME_ATTR}="${CSS.escape(o.id)}"],` +
        `[data-rcb-overlay="1"] [data-rcb-sel-chrome-layer] [${SEL_OUTLINE_ATTR}="${CSS.escape(o.id)}"],` +
        `[data-rcb-world="1"] > div[data-rcb-sel-chrome-layer] svg[${SEL_CHROME_ATTR}="${CSS.escape(o.id)}"]`
    )
    .forEach((n) => {
      try {
        n.remove();
      } catch {
        /* ignore */
      }
    });

  const angle = Number(o.angle) || 0;
  const root = ensureScreenChromeSvg(layer, o.id);

  let chrome = root.querySelector(`:scope > g[${SEL_CHROME_ATTR}="body"]`) as SVGGElement | null;
  if (!chrome) {
    chrome = document.createElementNS(SVG_NS, 'g');
    chrome.setAttribute(SEL_CHROME_ATTR, 'body');
    chrome.setAttribute('pointer-events', 'none');
    root.appendChild(chrome);
  }

  chrome.setAttribute(
    'transform',
    screenChromeBodyTransform(el, o.box, angle, camera, dpr ?? 1)
  );

  let outline = chrome.querySelector(
    `:scope > path[${SEL_OUTLINE_ATTR}="${CSS.escape(o.id)}"]`
  ) as SVGPathElement | null;
  if (!outline) {
    outline = document.createElementNS(SVG_NS, 'path');
    outline.setAttribute(SEL_OUTLINE_ATTR, o.id);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('pointer-events', 'none');
    chrome.insertBefore(outline, chrome.firstChild);
  }

  rememberNodePath2D(o.id, d);
  outline.setAttribute('d', d);
  const showPath = o.showPath !== false;
  outline.setAttribute('stroke', showPath ? o.color || '#3388ff' : 'none');
  outline.setAttribute('stroke-width', String(stroke));
  const roundStroke = Boolean(o.lineMode || o.shaftEndpoints);
  outline.setAttribute('stroke-linejoin', roundStroke ? 'round' : 'miter');
  outline.setAttribute('stroke-linecap', roundStroke ? 'round' : 'butt');

  if (o.withHandles) syncHostSelHandlesIfNeeded(chrome, o, stroke, inv, d, camera, dpr);
  else syncHostSelHandlesIfNeeded(chrome, { ...o, withHandles: false }, stroke, inv, d, camera, dpr);

  return true;
}

/** Path chrome under `[data-rcb-world]` (same CSS camera as hosts). */
function ShapeOutlineSvg({ outlines }: { outlines: ShapeOutlineItem[] }) {
  const camera = useRcbCamera();
  const dpr = useRcbDevicePixelRatio();
  const z = Math.max(0.05, rcbCameraCssZoom(camera));
  const inv = 1 / z;
  const stroke = CHROME_STROKE_PX * inv;
  const [hostEpoch, setHostEpoch] = useState(0);
  const outlineKey = outlines
    .map((o) => {
      const hostKeyId = o.mirrorHostId || o.id;
      const host = getShapeHost(hostKeyId);
      const hostEl = (host?.el || getSharedNodeEls()?.get(hostKeyId)) as SVGElement | null | undefined;
      const baseline =
        hostEl &&
        ((hostEl.getAttribute?.('data-baseline') === '1' ? hostEl : null) ||
          (hostEl.querySelector?.(':scope > [data-baseline="1"]') as SVGElement | null) ||
          (hostEl.querySelector?.('[data-baseline="1"]') as SVGElement | null));
      const liveD = readBaselinePathD(baseline, o.pathD);
      const tf = hostEl?.getAttribute?.('transform') || '';
      const anyEl = hostEl as { __sceneLeft?: number; __sceneTop?: number } | null | undefined;
      const origin = `${Number(anyEl?.__sceneLeft) || o.box.left},${Number(anyEl?.__sceneTop) || o.box.top}`;
      return `${o.id}:${o.unionChrome ? 1 : 0}:${o.mirrorHostId || ''}:${liveD.length}:${liveD.slice(0, 24)}:${liveD.slice(-24)}:${o.box.left.toFixed(1)},${o.box.top.toFixed(1)},${o.box.width}x${o.box.height}:${o.angle.toFixed(2)}:${o.withHandles ? 1 : 0}:${o.showPath === false ? 0 : 1}:${o.lineMode ? 1 : 0}:${o.shaftEndpoints ? 1 : 0}:${o.showRotate ? 1 : 0}:${o.cornerHandlesOnly ? 1 : 0}:${o.edgeHandles || 'all'}:${o.color || ''}:${tf}:${origin}`;
    })
    .join('|');
  const outlinesRef = useRef(outlines);
  outlinesRef.current = outlines;

  useEffect(() => subscribeShapeHosts(() => setHostEpoch((n) => n + 1)), []);

  useLayoutEffect(() => {
    const current = outlinesRef.current;
    const active = new Set(current.map((o) => o.id));
    let pending = current.filter((o) => !syncHostSelOutline(o, stroke, inv, camera, dpr));
    for (const h of listShapeHosts()) {
      if (!active.has(h.nodeId)) clearHostSelOutline(h.nodeId);
    }
    const layer = typeof document !== 'undefined'
      ? document.querySelector(`[${SEL_CHROME_LAYER_ATTR}]`)
      : null;
    // Only direct chrome roots (node id) — never nested body g[…="body"].
    layer?.querySelectorAll?.(`:scope > svg[${SEL_CHROME_ATTR}]`).forEach((n) => {
      const id = n.getAttribute(SEL_CHROME_ATTR);
      if (id && !active.has(id)) {
        try {
          n.remove();
        } catch {
          /* ignore */
        }
      }
    });

    let raf = 0;
    let tries = 0;
    const retry = () => {
      if (!pending.length) return;
      tries += 1;
      pending = pending.filter((o) => !syncHostSelOutline(o, stroke, inv, camera, dpr));
      if (pending.length && tries < 120) raf = requestAnimationFrame(retry);
    };
    if (pending.length) raf = requestAnimationFrame(retry);

    // High zoom: sticky host origin can drift without React props — refresh transform.
    let stickRaf = 0;
    const stickLoop = () => {
      for (const o of outlinesRef.current) {
        syncHostSelOutline(o, stroke, inv, camera, dpr);
      }
      stickRaf = requestAnimationFrame(stickLoop);
    };
    if (z >= 2) stickRaf = requestAnimationFrame(stickLoop);

    disposeLegacyHitPadLayer();

    return () => {
      cancelAnimationFrame(raf);
      if (stickRaf) cancelAnimationFrame(stickRaf);
      const next = new Set(outlinesRef.current.map((o) => o.id));
      for (const id of active) {
        if (!next.has(id)) clearHostSelOutline(id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlineKey, stroke, inv, hostEpoch, camera.x, camera.y, camera.zoom, dpr]);

  useEffect(() => {
    return () => {
      for (const o of outlinesRef.current) {
        clearHostSelOutline(o.id);
      }
    };
  }, []);

  return null;
}

export {
  liveShapeGeomBox,
  nodeUsesPathChrome,
  nodeUsesOpenStrokeEndpoints,
  pathLocalEndpoints,
  localPointToWorld,
  boxFromLocalAnchor,
  hostSelHandlesKey,
  ShapeOutlineSvg,
};
