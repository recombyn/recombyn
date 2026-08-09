/**
 * Post-split regression: exercise modules extracted from SelectionFeature /
 * editor / SvgCanvas so import + behavior stay wired.
 */
import { describe, expect, it } from 'vitest';
import {
  FRAME_SEL_PREFIX,
  frameSelId,
  parseFrameSelId,
} from '../frameSelectionIds';
import {
  computeMovedUnion,
  computeResizedUnion,
  framesHittingMarquee,
  filterMarqueeContentHits,
  commitMarqueeSelection,
  normalizeBox,
  boxesIntersect,
  makeDragSeed,
} from '../selectionLogic';
import { computeShapeBoolean, type ShapeBox } from '../shapeBoolean';
import { smartSnapThreshold } from '../alignGuides';
import {
  asHistoryEntry,
  cloneDocument,
  pushHistory,
  pushNodePatchHistory,
  restoreNodesIntoDocument,
  scrubNodeIdsFromHistory,
  type EditorHistoryHost,
} from '@/store/modules/editorHistory';
import {
  createEmptyDocument,
  addNodeToDocument,
} from '@/components/rcb/scene/document/sceneDocument';
import { createShapeNode } from '@/components/rcb/scene/document/nodeFactories';
import type { SceneDocument } from '@/components/rcb/sceneNode';

describe('frameSelectionIds', () => {
  it('round-trips frame ids and rejects plain node ids', () => {
    const id = frameSelId('frame_abc');
    expect(id.startsWith(FRAME_SEL_PREFIX)).toBe(true);
    expect(parseFrameSelId(id)).toBe('frame_abc');
    expect(parseFrameSelId('node_1')).toBeNull();
    expect(parseFrameSelId('')).toBeNull();
  });
});

describe('selectionLogic marquee helpers', () => {
  it('normalizeBox + boxesIntersect', () => {
    const box = normalizeBox(120, 80, 20, 10);
    expect(box).toEqual({ left: 20, top: 10, width: 100, height: 70 });
    expect(boxesIntersect(box, { left: 90, top: 50, width: 40, height: 40 })).toBe(true);
    expect(boxesIntersect(box, { left: 200, top: 200, width: 10, height: 10 })).toBe(false);
  });

  it('framesHittingMarquee + filter + commit', () => {
    const doc = {
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      frames: [
        { id: 'f1', name: 'F1', x: 0, y: 0, width: 100, height: 100, backgroundColor: '#fff' },
        { id: 'f2', name: 'F2', x: 200, y: 200, width: 50, height: 50, backgroundColor: '#fff' },
      ],
      deltaSetLike: {
        n1: { id: 'n1', key: 'rect', x: 10, y: 10, width: 20, height: 20, attrs: {}, children: [] },
        n2: { id: 'n2', key: 'rect', x: 210, y: 210, width: 10, height: 10, attrs: {}, children: [] },
      },
    } satisfies Partial<SceneDocument> as SceneDocument;
    const hits = framesHittingMarquee(doc, { left: 0, top: 0, width: 80, height: 80 });
    expect(hits.map((h) => h.id)).toEqual(['f1']);

    const filtered = filterMarqueeContentHits(doc, ['n1', 'n2'], new Set(['f1']));
    expect(filtered).toContain('n1');
    expect(Array.isArray(filtered)).toBe(true);

    const selected: { nodes: string[]; frames: string[] } = { nodes: [], frames: [] };
    commitMarqueeSelection({
      contentHits: ['n1'],
      frameHits: hits.map((h) => h.id),
      rawHits: ['n1'],
      shiftKey: false,
      onSelectMixed: (nodes, frames) => {
        selected.nodes = nodes;
        selected.frames = frames;
      },
      onSelect: (nodes) => {
        selected.nodes = nodes;
      },
      onSelectFrames: (frames) => {
        selected.frames = frames;
      },
    });
    expect(selected.frames).toContain('f1');
    expect(selected.nodes).toContain('n1');
  });
});

describe('selectionLogic computeMovedUnion (smart + grid)', () => {
  it('snaps flush to sibling and returns finite deltas', () => {
    const sibling = { left: 0, top: 0, width: 100, height: 80 };
    const moving = { left: 98, top: 2, width: 40, height: 40 };
    const { nextUnion, sdx, sdy, guides } = computeMovedUnion({
      union: moving,
      origins: [{ nodeId: 'm', box: moving }],
      document: {
        x: 0,
        y: 0,
        width: 400,
        height: 400,
        deltaSetLike: {
          m: { id: 'm', key: 'rect', x: 98, y: 2, width: 40, height: 40, attrs: {}, children: [] },
          s: { id: 's', key: 'rect', x: 0, y: 0, width: 100, height: 80, attrs: {}, children: [] },
        },
      } as SceneDocument,
      dx: 2,
      dy: -2,
      disableSnap: false,
      gridSize: 1,
      targets: [sibling],
      threshold: smartSnapThreshold(1),
    });
    expect(Number.isFinite(sdx)).toBe(true);
    expect(Number.isFinite(sdy)).toBe(true);
    expect(nextUnion.width).toBe(40);
    expect(nextUnion.height).toBe(40);
    // Intended left≈100 → flush to sibling.right
    expect(Math.abs(nextUnion.left - 100)).toBeLessThanOrEqual(2);
    expect(Array.isArray(guides)).toBe(true);
  });
});

describe('selectionLogic computeResizedUnion', () => {
  it('grows from se handle', () => {
    const box = { left: 10, top: 20, width: 100, height: 50 };
    const drag = makeDragSeed(
      'resize',
      { clientX: 110, clientY: 70 },
      { x: 110, y: 70 },
      {
        handle: 'se',
        origins: [{ nodeId: 'r', box }],
        union: box,
        angle0: 0,
        aspectRatio: 2,
      }
    );
    const { next, lockAspect, guides } = computeResizedUnion({
      document: {
        x: 0,
        y: 0,
        width: 400,
        height: 400,
        deltaSetLike: {
          r: { id: 'r', key: 'rect', x: 10, y: 20, width: 100, height: 50, attrs: {}, children: [] },
        },
      } as SceneDocument,
      drag,
      dx: 20,
      dy: 10,
      shiftKey: false,
      disableSnap: false,
      gridSize: 1,
      targets: [],
      threshold: smartSnapThreshold(1),
    });
    expect(next.width).toBeGreaterThan(100);
    expect(next.height).toBeGreaterThan(50);
    expect(typeof lockAspect).toBe('boolean');
    expect(Array.isArray(guides)).toBe(true);
  });
});

describe('boolean ops (all modes)', () => {
  const a: ShapeBox = {
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    shapeType: 'rect',
  };
  const b: ShapeBox = {
    left: 50,
    top: 50,
    width: 100,
    height: 100,
    shapeType: 'rect',
  };

  it.each(['union', 'subtract', 'intersect', 'exclude'] as const)('%s two overlapping rects', (mode) => {
    const { result, usedFallback } = computeShapeBoolean([a, b], mode);
    expect(result).not.toBeNull();
    expect(usedFallback).toBe(false);
    expect(result!.width).toBeGreaterThan(0);
    expect(result!.height).toBeGreaterThan(0);
    expect(String(result!.path || '').length).toBeGreaterThan(4);
  });
});

describe('editorHistory post-split', () => {
  it('push/scrub/restore node patches', () => {
    let doc = createEmptyDocument({ emptyWorld: true });
    const { id, node } = createShapeNode({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      shapeType: 'rect',
      fill: '#111',
    });
    doc = addNodeToDocument(doc, id, node);
    const host: EditorHistoryHost = {
      document: doc,
      historyPast: [],
      historyFuture: [],
    };
    pushHistory(host);
    expect(asHistoryEntry(host.historyPast[0]!).kind).toBe('snap');
    expect(cloneDocument(doc)?.deltaSetLike?.[id]).toBeTruthy();

    pushNodePatchHistory(host, [id]);
    const last = asHistoryEntry(host.historyPast[host.historyPast.length - 1]!);
    expect(last.kind).toBe('nodes');

    const patched = {
      ...doc,
      deltaSetLike: {
        ...doc.deltaSetLike,
        [id]: {
          ...doc.deltaSetLike[id],
          attrs: { ...doc.deltaSetLike[id].attrs, fill: '#f00' },
        },
      },
    };
    const restored = restoreNodesIntoDocument(patched, (last as any).before);
    expect(restored.deltaSetLike[id].attrs.fill).not.toBe('#f00');

    scrubNodeIdsFromHistory(host, [id]);
    for (const raw of host.historyPast) {
      const e = asHistoryEntry(raw);
      if (e.kind === 'nodes') expect(id in e.before).toBe(false);
      if (e.kind === 'snap') expect(e.doc?.deltaSetLike?.[id]).toBeFalsy();
    }
  });
});
