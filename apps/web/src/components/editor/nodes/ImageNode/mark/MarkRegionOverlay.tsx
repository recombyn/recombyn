import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  memo,
} from 'react';
import {
  RcbOverlayPortal,
  useRcbCamera,
  rcbSceneToScreen,
} from '@/components/rcb';

/** Mark rect in image-local coords (origin = image top-left). */
export type MarkRect = { x: number; y: number; w: number; h: number };

export type MarkRegion = MarkRect & {
  id: string;
  /** 1-based display index. */
  index: number;
  label?: string;
  kind?: 'image' | 'text' | 'manual' | string;
  selected?: boolean;
};

const MIN_MARK = 12;
/** Scene px — below this, pointer-up on a hit region counts as click-select. */
const CLICK_SLOP = 4;

function normalizeDragBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cw: number,
  ch: number
): MarkRect | null {
  const left = Math.max(0, Math.min(x0, x1));
  const top = Math.max(0, Math.min(y0, y1));
  const right = Math.min(cw, Math.max(x0, x1));
  const bottom = Math.min(ch, Math.max(y0, y1));
  const w = right - left;
  const h = bottom - top;
  if (w < MIN_MARK || h < MIN_MARK) return null;
  return { x: left, y: top, w, h };
}

function pointInRect(px: number, py: number, r: MarkRect): boolean {
  return px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h;
}

type Props = {
  imageBox: { left: number; top: number; width: number; height: number };
  regions: MarkRegion[];
  draft: MarkRect | null;
  detecting?: boolean;
  onDraftChange: (rect: MarkRect | null) => void;
  onCommitDraft: (rect: MarkRect) => void;
  onSelectRegion: (id: string, additive: boolean) => void;
};

/**
 * On-image mark overlay: crosshair cursor, drag-to-box, dashed region badges.
 */
function MarkRegionOverlay({
  imageBox,
  regions,
  draft,
  detecting,
  onDraftChange,
  onCommitDraft,
  onSelectRegion,
}: Props): ReactNode {
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const dragRef = useRef<{
    x0: number;
    y0: number;
    pointerId: number;
    hitId: string | null;
    additive: boolean;
    moved: boolean;
  } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  const onCommitDraftRef = useRef(onCommitDraft);
  const onSelectRegionRef = useRef(onSelectRegion);
  onDraftChangeRef.current = onDraftChange;
  onCommitDraftRef.current = onCommitDraft;
  onSelectRegionRef.current = onSelectRegion;

  const origin = rcbSceneToScreen(camera, imageBox.left, imageBox.top);
  const stageW = Math.max(1, imageBox.width * z);
  const stageH = Math.max(1, imageBox.height * z);
  const cw = imageBox.width;
  const ch = imageBox.height;

  const localFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const lx = (clientX - origin.x) / z;
      const ly = (clientY - origin.y) / z;
      return {
        x: Math.max(0, Math.min(cw, lx)),
        y: Math.max(0, Math.min(ch, ly)),
        inside: lx >= 0 && ly >= 0 && lx <= cw && ly <= ch,
      };
    },
    [origin.x, origin.y, z, cw, ch]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const p = localFromClient(e.clientX, e.clientY);
      const dist = Math.hypot(p.x - drag.x0, p.y - drag.y0);
      if (dist >= CLICK_SLOP) drag.moved = true;
      // Started on an existing region → click-select only, never start a new box.
      if (drag.hitId) return;
      onDraftChangeRef.current(normalizeDragBox(drag.x0, drag.y0, p.x, p.y, cw, ch));
    };
    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      const p = localFromClient(e.clientX, e.clientY);
      if (drag.hitId) {
        onDraftChangeRef.current(null);
        onSelectRegionRef.current(drag.hitId, drag.additive);
        return;
      }
      const box = normalizeDragBox(drag.x0, drag.y0, p.x, p.y, cw, ch);
      onDraftChangeRef.current(null);
      if (box) onCommitDraftRef.current(box);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [localFromClient, cw, ch]);

  const shellStyle: CSSProperties = {
    position: 'absolute',
    left: origin.x,
    top: origin.y,
    width: stageW,
    height: stageH,
    zIndex: 34,
    cursor: 'crosshair',
    touchAction: 'none',
  };

  const renderBox = (
    r: MarkRect,
    opts: {
      id?: string;
      index?: number;
      label?: string;
      selected?: boolean;
      draft?: boolean;
    }
  ) => {
    const selected = Boolean(opts.selected);
    const isDraft = Boolean(opts.draft);
    const hovered = opts.id != null && hoverId === opts.id;
    const left = r.x * z;
    const top = r.y * z;
    const width = Math.max(1, r.w * z);
    const height = Math.max(1, r.h * z);
    const borderColor =
      selected || isDraft
        ? 'rgba(255,255,255,0.95)'
        : hovered
          ? 'rgba(255,255,255,0.8)'
          : 'rgba(255,255,255,0.65)';
    const badgeBg = selected ? '#3b82f6' : '#60a5fa';

    return (
      <div
        key={opts.id || 'draft'}
        data-mark-region={opts.id || 'draft'}
        className="pointer-events-none absolute"
        style={{
          left,
          top,
          width,
          height,
          border: `1.5px dashed ${borderColor}`,
          boxShadow: selected
            ? '0 0 0 1px rgba(59,130,246,0.35), inset 0 0 0 9999px rgba(59,130,246,0.08)'
            : 'inset 0 0 0 9999px rgba(255,255,255,0.04)',
          boxSizing: 'border-box',
        }}
      >
        {opts.index != null ? (
          <span
            className="pointer-events-none absolute right-0 top-1/2 flex h-5 min-w-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-md px-1 text-[11px] font-semibold text-white shadow-sm"
            style={{ background: badgeBg }}
          >
            {opts.index}
          </span>
        ) : null}
        {opts.label ? (
          <span
            className="pointer-events-none absolute -bottom-6 right-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-[#1e3a8a] shadow-sm"
            style={{ background: 'rgba(191,219,254,0.95)' }}
          >
            {opts.label}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <RcbOverlayPortal>
      <div
        data-image-tool-panel
        data-mark-overlay
        className="pointer-events-auto absolute"
        style={shellStyle}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation?.();
          const p = localFromClient(e.clientX, e.clientY);
          if (!p.inside) return;

          const hit = [...regions].reverse().find((r) => pointInRect(p.x, p.y, r));
          dragRef.current = {
            x0: p.x,
            y0: p.y,
            pointerId: e.pointerId,
            hitId: hit?.id ?? null,
            additive: e.shiftKey,
            moved: false,
          };
          onDraftChange(null);
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (dragRef.current) return;
          const p = localFromClient(e.clientX, e.clientY);
          if (!p.inside) {
            setHoverId(null);
            return;
          }
          const hit = [...regions].reverse().find((r) => pointInRect(p.x, p.y, r));
          setHoverId(hit?.id ?? null);
        }}
        onPointerLeave={() => {
          if (!dragRef.current) setHoverId(null);
        }}
      >
        {detecting ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-medium text-[var(--ink)] shadow-sm">
              识别主题中…
            </span>
          </div>
        ) : null}
        {regions.map((r) =>
          renderBox(r, {
            id: r.id,
            index: r.index,
            label: r.label,
            selected: r.selected,
          })
        )}
        {draft && draft.w >= 1 && draft.h >= 1
          ? renderBox(draft, { draft: true })
          : null}
      </div>
    </RcbOverlayPortal>
  );
}

export default memo(MarkRegionOverlay);
