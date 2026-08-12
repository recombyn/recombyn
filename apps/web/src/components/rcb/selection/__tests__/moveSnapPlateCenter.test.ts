import { describe, expect, it } from 'vitest';
import {
  collectMoveSnapIndicators,
  collectSmartGuidesAt,
  GUIDE_COINCIDE_EPS,
  isOversizedMidSnapTarget,
  smartGuideTargetPad,
  SMART_SNAP_MAX_SCENE,
  smartSnapThreshold,
  snapBoxToGrid,
  snapMoveToSmartGuides,
} from '../alignGuides';

/** Production: smart magnets → grid lattice pin (grid is not a magnet). */
function productionMoveSettle(opts: {
  box: { left: number; top: number; width: number; height: number };
  targets: Array<{ left: number; top: number; width: number; height: number }>;
  zoom: number;
  gridSize?: number;
}) {
  const gridSize = opts.gridSize ?? 1;
  const threshold = smartSnapThreshold(opts.zoom);
  let next = { ...opts.box };
  let guides = [] as ReturnType<typeof snapMoveToSmartGuides>['guides'];
  let smartX = false;
  let smartY = false;
  if (threshold > 0 && opts.targets.length) {
    const smart = snapMoveToSmartGuides({
      box: next,
      targets: opts.targets,
      threshold,
    });
    next = smart.box;
    guides = smart.guides;
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
    guides = collectMoveSnapIndicators(next, opts.targets, GUIDE_COINCIDE_EPS);
  }
  return { box: next, threshold, guides };
}

const CANVAS_ZOOMS = [0.05, 0.13, 0.25, 0.31, 0.5, 0.8, 1, 2, 8, 20, 40, 80] as const;

describe('move snap (points + indicators)', () => {
  const sibling = { left: 0, top: 0, width: 120, height: 90 };
  const plate = { left: -200, top: -200, width: 800, height: 600 };

  it('detects oversized mid targets', () => {
    const mover = { left: 140, top: 0, width: 120, height: 90 };
    expect(isOversizedMidSnapTarget(mover, plate)).toBe(true);
    expect(isOversizedMidSnapTarget(mover, sibling)).toBe(false);
  });

  it.each([...CANVAS_ZOOMS])(
    'does not lock to plate mid while hunting flush @ zoom %s',
    (zoom) => {
      const targets = [sibling, plate];
      const threshold = smartSnapThreshold(zoom);
      // Plate center is (200,100). Mover near sibling flush (120).
      const settled = productionMoveSettle({
        box: { left: 140, top: 0, width: 120, height: 90 },
        targets,
        zoom,
        gridSize: 0,
      });
      // Must not yank X to plate mid (200).
      expect(settled.box.left).not.toBe(200);
      if (Math.abs(140 - 120) <= threshold) {
        expect(settled.box.left).toBe(120);
      } else {
        expect(settled.box.left).toBe(140);
      }
    }
  );

  it('still mid-mid snaps peers (corners + center)', () => {
    const peer = { left: 0, top: 0, width: 200, height: 40 }; // mid 100
    const mover = { left: 55, top: 80, width: 80, height: 40 }; // mid 95
    const settled = productionMoveSettle({
      box: mover,
      targets: [peer],
      zoom: 1,
      gridSize: 0,
    });
    // |100-95|=5 ≤ 8 → center-align on X
    expect(settled.box.left).toBe(60);
  });

  it('small mover still mid-mid snaps to oversized plate center', () => {
    // Plate mid (200,100). Tiny rect near center must feel the magnet.
    const plate = { left: -200, top: -200, width: 800, height: 600 };
    const tiny = { left: 196, top: 94, width: 24, height: 18 }; // mid 208 / 103
    expect(isOversizedMidSnapTarget(tiny, plate)).toBe(true);
    const settled = productionMoveSettle({
      box: tiny,
      targets: [plate],
      zoom: 1,
      gridSize: 0,
    });
    expect(settled.box.left + settled.box.width / 2).toBeCloseTo(200, 6);
    expect(settled.box.top + settled.box.height / 2).toBeCloseTo(100, 6);
    expect(settled.guides.some((g) => g.kind === 'align' && g.axis === 'x')).toBe(true);
    expect(settled.guides.some((g) => g.kind === 'align' && g.axis === 'y')).toBe(true);
  });

  it('odd-size center align is not yanked off by 1px grid pin', () => {
    // Square 100×100 center 50; circle 99×99 needs left=0.5 for mid-mid.
    // Start near center so mid magnet beats edge flush.
    const square = { left: 0, top: 0, width: 100, height: 100 };
    const circle = { left: 0.6, top: 0.6, width: 99, height: 99 }; // mid 50.1
    const settled = productionMoveSettle({
      box: circle,
      targets: [square],
      zoom: 1,
      gridSize: 1,
    });
    expect(settled.box.left + settled.box.width / 2).toBeCloseTo(50, 6);
    expect(settled.box.top + settled.box.height / 2).toBeCloseTo(50, 6);
    // Old bug: snapBoxToGrid after smart → left 0 or 1, centers diverge → two guide dots.
    expect(settled.box.left).toBeCloseTo(0.5, 6);
    expect(settled.box.top).toBeCloseTo(0.5, 6);
  });

  it('still snaps edge flush and top-edge coincide', () => {
    const a = { left: 0, top: 20, width: 100, height: 80 };
    const b = { left: 103, top: 22, width: 80, height: 60 };
    const settled = productionMoveSettle({
      box: b,
      targets: [a],
      zoom: 1,
      gridSize: 0,
    });
    expect(settled.box.left).toBe(100); // flush
    expect(settled.box.top).toBe(20);
    expect(settled.guides.some((g) => g.kind === 'align' && g.axis === 'x')).toBe(true);
    expect(settled.guides.some((g) => g.kind === 'align' && g.axis === 'y')).toBe(true);
  });

  it('move indicators never include free gap badges', () => {
    const a = { left: 0, top: 0, width: 100, height: 80 };
    // Gap 11 outside magnet at zoom 1; Y far from edges.
    const b = { left: 111, top: 50, width: 80, height: 80 };
    const settled = productionMoveSettle({ box: b, targets: [a], zoom: 1, gridSize: 0 });
    expect(settled.box.left).toBe(111);
    expect(settled.box.top).toBe(50);
    expect(settled.guides.some((g) => g.kind === 'gap')).toBe(false);
    // Inspect helper may still show spacing — not used during drag.
    const paint = collectSmartGuidesAt(settled.box, [a], GUIDE_COINCIDE_EPS);
    expect(paint.some((g) => g.kind === 'gap' && g.dist === 11)).toBe(true);
  });

  it('threshold is 8/zoom capped at SMART_SNAP_MAX_SCENE', () => {
    const zoom = 0.05;
    expect(smartSnapThreshold(zoom)).toBeCloseTo(SMART_SNAP_MAX_SCENE, 9);
    const left = { left: 0, top: 0, width: 120, height: 90 };
    // Outside capped magnet — must not flush.
    const far = { left: 120 + SMART_SNAP_MAX_SCENE + 20, top: 0, width: 120, height: 90 };
    const farSettled = productionMoveSettle({ box: far, targets: [left], zoom, gridSize: 0 });
    expect(farSettled.box.left).toBe(far.left);
    // Within capped magnet — should flush.
    const near = { left: 120 + SMART_SNAP_MAX_SCENE * 0.5, top: 0, width: 120, height: 90 };
    const nearSettled = productionMoveSettle({ box: near, targets: [left], zoom, gridSize: 0 });
    expect(nearSettled.box.left).toBe(120);
  });

  it('smartGuideTargetPad covers neighbors beyond snap radius', () => {
    expect(smartGuideTargetPad(8)).toBe(180);
    expect(smartGuideTargetPad(100)).toBe(300);
  });
});
