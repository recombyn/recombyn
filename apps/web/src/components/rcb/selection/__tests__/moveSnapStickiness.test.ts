import { describe, expect, it } from 'vitest';
import {
  smartSnapThreshold,
  snapBoxToGrid,
  snapMoveToSmartGuides,
  snapCoordToGrid,
} from '../alignGuides';
import { inflateBoxByVisualOutset } from '../../scene/document/sceneEffects';

/** Same settle order as computeMovedUnion (smart → grid; lattice skips smart axes). */
function productionMoveSettle(opts: {
  box: { left: number; top: number; width: number; height: number };
  targets: Array<{ left: number; top: number; width: number; height: number }>;
  zoom: number;
  gridSize?: number;
}) {
  const gridSize = opts.gridSize ?? 1;
  const threshold = smartSnapThreshold(opts.zoom);
  let next = { ...opts.box };
  let smartX = false;
  let smartY = false;
  if (threshold > 0 && opts.targets.length) {
    const smart = snapMoveToSmartGuides({
      box: next,
      targets: opts.targets,
      threshold,
    });
    next = smart.box;
    smartX = smart.snappedX;
    smartY = smart.snappedY;
  }
  if (gridSize > 0) {
    const pinned = snapBoxToGrid(next, gridSize);
    next = {
      ...next,
      left: smartX ? next.left : pinned.left,
      top: smartY ? next.top : pinned.top,
    };
  }
  return { box: next, threshold };
}

function assertBoxOnGrid(
  box: { left: number; top: number; width: number; height: number },
  gridSize: number
) {
  expect(box.left).toBeCloseTo(snapCoordToGrid(box.left, gridSize), 9);
  expect(box.top).toBeCloseTo(snapCoordToGrid(box.top, gridSize), 9);
}

describe('move snap grid integrity (magnets + lattice pin)', () => {
  const sibling = { left: 0, top: 0, width: 135, height: 292 };

  it('oscillating near a sibling never leaves the grid at any zoom', () => {
    for (const zoom of [0.05, 0.25, 0.5, 1, 2, 8]) {
      for (let i = 0; i < 40; i += 1) {
        // Pointer wanders around flush / gap-4 / gap-12 like a user hunting the magnet.
        const intended =
          sibling.left + sibling.width + 4 + Math.sin(i * 0.9) * 10 + (i % 3) * 0.17;
        const top = Math.cos(i * 0.6) * 5.3;
        const { box } = productionMoveSettle({
          box: { left: intended, top, width: 135, height: 292 },
          targets: [sibling],
          zoom,
        });
        assertBoxOnGrid(box, 1);
      }
    }
  });

  it('grid-first settle follows pointer by whole cells once past the magnet', () => {
    // After escaping flush, each grid step of the pointer should move the box.
    const zoom = 1;
    const threshold = smartSnapThreshold(zoom);
    const escaped = sibling.left + sibling.width + threshold + 3;
    const a = productionMoveSettle({
      box: { left: escaped, top: 0, width: 135, height: 292 },
      targets: [sibling],
      zoom,
    });
    const b = productionMoveSettle({
      box: { left: escaped + 1, top: 0, width: 135, height: 292 },
      targets: [sibling],
      zoom,
    });
    expect(a.box.left).toBe(snapCoordToGrid(escaped, 1));
    expect(b.box.left).toBe(a.box.left + 1);
    assertBoxOnGrid(a.box, 1);
    assertBoxOnGrid(b.box, 1);
  });

  it('center-stroke visual settle keeps ink on integer cells while hunting snap', () => {
    const node = {
      key: 'shape',
      attrs: {
        shapeType: 'rect',
        'border-width': 1,
        'border-color': '#333',
        strokeAlign: 'center',
        'stroke-enabled': 'true',
        'stroke-visible': 'true',
      },
    };
    const leftPath = { left: 0.5, top: 0.5, width: 134, height: 291 };
    const leftVis = inflateBoxByVisualOutset(leftPath, node);
    let path = { left: 140.5, top: 0.5, width: 134, height: 291 };

    for (let i = 0; i < 25; i += 1) {
      const vis0 = inflateBoxByVisualOutset(path, node);
      const intendedLeft = leftVis.left + leftVis.width + 4 + Math.sin(i) * 6;
      const dragged = {
        ...vis0,
        left: intendedLeft,
        top: vis0.top + Math.cos(i * 0.5) * 2.4,
      };
      const { box: vis1 } = productionMoveSettle({
        box: dragged,
        targets: [leftVis],
        zoom: 1,
      });
      const sdx = vis1.left - vis0.left;
      const sdy = vis1.top - vis0.top;
      path = { ...path, left: path.left + sdx, top: path.top + sdy };
      const ink = inflateBoxByVisualOutset(path, node);
      expect(ink.left).toBeCloseTo(snapCoordToGrid(ink.left, 1), 9);
      expect(ink.top).toBeCloseTo(snapCoordToGrid(ink.top, 1), 9);
      expect(ink.left + ink.width).toBeCloseTo(snapCoordToGrid(ink.left + ink.width, 1), 9);
      expect(ink.top + ink.height).toBeCloseTo(snapCoordToGrid(ink.top + ink.height, 1), 9);
    }
  });

  it('closest offset wins each frame — no sticky hold', () => {
    const left = { left: 0, top: 0, width: 100, height: 80 };
    const rightAnchor = { left: 204, top: 0, width: 100, height: 80 };
    const targets = [left, rightAnchor];

    const first = productionMoveSettle({
      box: { left: 100.4, top: 0, width: 100, height: 80 },
      targets,
      zoom: 1,
      gridSize: 0,
    });
    expect(first.box.left).toBe(100);

    // Pointer clearly prefers the competing flush (104).
    const second = productionMoveSettle({
      box: { left: 102.8, top: 0, width: 100, height: 80 },
      targets,
      zoom: 1,
      gridSize: 0,
    });
    expect(second.box.left).toBeCloseTo(104, 9);
  });
});
