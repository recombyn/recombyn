import { describe, expect, it } from 'vitest';
import {
  SMART_SNAP_PX,
  SMART_SNAP_MAX_SCENE,
  GUIDE_COINCIDE_EPS,
  smartSnapThreshold,
  snapMoveToSmartGuides,
  snapBoxToGrid,
  collectMoveSnapIndicators,
  collectSmartGuidesAt,
} from '../alignGuides';
import {
  CHROME_HANDLE_HIT_PX,
  CHROME_RADIUS_HIT_PX,
  CHROME_RADIUS_PARK_GAP_PX,
  chromeHitScaleForBox,
  radiusHandleParkScreenPx,
  radiusHandlesFitOnScreen,
  radiusParkSceneForBox,
} from '../SelectionChrome';

/** Canvas zooms from floor → extreme (includes user repro ~31%). */
const CANVAS_ZOOMS = [0.05, 0.13, 0.25, 0.31, 0.5, 0.8, 1, 2, 8, 20, 40, 80] as const;

/** Production move settle: smart magnets → grid (lattice skips smart-pinned axes). */
function settleMove(opts: {
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
  return { box: next, guides, threshold };
}

describe('smartSnapThreshold @ all canvas zooms (8/zoom, capped)', () => {
  it.each([...CANVAS_ZOOMS])('is screen-constant (px/zoom) at zoom %s', (zoom) => {
    const threshold = smartSnapThreshold(zoom);
    expect(threshold).toBeCloseTo(Math.min(SMART_SNAP_PX / zoom, SMART_SNAP_MAX_SCENE), 6);
  });

  it.each([...CANVAS_ZOOMS])(
    'does not yank across a gap beyond the screen-px magnet at zoom %s',
    (zoom) => {
      const left = { left: 0, top: 0, width: 120, height: 90 };
      const threshold = smartSnapThreshold(zoom);
      // Stay clearly outside the magnet in scene space.
      const gap = threshold + 10;
      const right = {
        left: left.left + left.width + gap,
        top: 0,
        width: 120,
        height: 90,
      };
      const nudged = { ...right, left: right.left - 2 };
      const { box } = settleMove({
        box: nudged,
        targets: [left],
        zoom,
        gridSize: 0,
      });
      expect(box.left).toBeCloseTo(nudged.left, 9);
      expect(box.left - (left.left + left.width)).toBeCloseTo(gap - 2, 9);
    }
  );

  it.each([...CANVAS_ZOOMS])(
    'snaps flush when gap is within the screen-px threshold at zoom %s',
    (zoom) => {
      const left = { left: 0, top: 0, width: 100, height: 80 };
      const threshold = smartSnapThreshold(zoom);
      // Stay strictly inside the magnet (avoid equality / float edge).
      const gap = Math.max(1e-6, threshold * 0.5);
      const right = {
        left: left.left + left.width + gap,
        top: 0,
        width: 100,
        height: 80,
      };
      const settled = settleMove({ box: right, targets: [left], zoom, gridSize: 0 });
      expect(settled.box.left).toBeCloseTo(left.left + left.width, 6);
      expect(settled.guides.some((g) => g.kind === 'align' && g.axis === 'x')).toBe(true);
      // No free gap chrome on drag indicators.
      expect(settled.guides.some((g) => g.kind === 'gap')).toBe(false);
    }
  );

  it('at 5% zoom magnet is capped (SMART_SNAP_MAX_SCENE) — no distant yank', () => {
    const zoom = 0.05;
    const left = { left: 0, top: 0, width: 120, height: 90 };
    expect(smartSnapThreshold(zoom)).toBeCloseTo(SMART_SNAP_MAX_SCENE, 9);
    // Outside capped magnet — must not flush.
    const far = {
      left: left.left + left.width + SMART_SNAP_MAX_SCENE + 20,
      top: 0,
      width: 120,
      height: 90,
    };
    const farSettled = settleMove({ box: far, targets: [left], zoom, gridSize: 0 });
    expect(farSettled.box.left).toBeCloseTo(far.left, 6);
    // Inside capped magnet — flush.
    const near = {
      left: left.left + left.width + SMART_SNAP_MAX_SCENE * 0.5,
      top: 0,
      width: 120,
      height: 90,
    };
    const nearSettled = settleMove({ box: near, targets: [left], zoom, gridSize: 0 });
    expect(nearSettled.box.left).toBeCloseTo(left.left + left.width, 6);
  });

  it.each([0.13, 0.25, 0.31, 0.5, 1])(
    'inspect helper may show gap badge when not edge-aligned at zoom %s',
    (zoom) => {
      const left = { left: 0, top: 0, width: 100, height: 80 };
      const right = { left: 140, top: 10, width: 100, height: 80 };
      // Paint-only inspect — not the move indicator path.
      const guides = collectSmartGuidesAt(right, [left], GUIDE_COINCIDE_EPS);
      const gaps = guides.filter((g) => g.kind === 'gap');
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps.some((g) => g.kind === 'gap' && g.dist === 40)).toBe(true);
      expect(guides.some((g) => g.kind === 'align')).toBe(false);
      // Move path must not surface that free gap.
      const moveIndicators = collectMoveSnapIndicators(right, [left], GUIDE_COINCIDE_EPS);
      expect(moveIndicators.some((g) => g.kind === 'gap')).toBe(false);
      void zoom;
    }
  );

  it('at 31% zoom does not paint distant edges as aligned (old threshold-as-eps)', () => {
    const zoom = 0.31;
    const threshold = smartSnapThreshold(zoom);
    expect(threshold).toBeCloseTo(Math.min(SMART_SNAP_PX / zoom, SMART_SNAP_MAX_SCENE), 6);
    expect(threshold).toBeGreaterThan(0);
    const left = { left: 0, top: 0, width: 100, height: 80 };
    // Gap inside magnet radius but outside paint coincide eps.
    const gap = Math.max(1, Math.floor(threshold * 0.5));
    // Offset Y so tops/mids/bottoms do not coincide — only the false X paint matters.
    const right = {
      left: left.left + left.width + gap,
      top: 6,
      width: 100,
      height: 80,
    };

    const paintOnly = collectMoveSnapIndicators(right, [left], GUIDE_COINCIDE_EPS);
    expect(paintOnly.some((g) => g.kind === 'align')).toBe(false);

    // Wrong paint (threshold as eps) would falsely claim X alignment:
    const falsePaint = collectSmartGuidesAt(right, [left], Math.max(0.51, threshold));
    expect(falsePaint.some((g) => g.kind === 'align' && g.axis === 'x')).toBe(true);

    // Settle still snaps flush within the screen-px magnet, then paints real align.
    const settled = settleMove({
      box: { ...right, top: 0 },
      targets: [left],
      zoom,
      gridSize: 0,
    });
    expect(settled.box.left).toBeCloseTo(left.left + left.width, 6);
    expect(settled.guides.some((g) => g.kind === 'align' && g.axis === 'x')).toBe(true);
  });

  it('near-align probe must not clear guides (old stillAligned bug)', () => {
    const left = { left: 0, top: 0, width: 100, height: 80 };
    const right = { left: 100.3, top: 0, width: 100, height: 80 };
    const guides = collectSmartGuidesAt(snapBoxToGrid(right, 1), [left], 8);
    expect(guides.some((g) => g.kind === 'gap' || g.kind === 'align')).toBe(true);
  });
});

describe('radius park + chrome hits @ all canvas zooms', () => {
  const box = { w: 200, h: 150 };

  it.each([...CANVAS_ZOOMS])(
    'keeps park near the corner (<=45% half-side) at zoom %s',
    (zoom) => {
      const park = radiusParkSceneForBox(box.w, box.h, zoom);
      const half = Math.min(box.w, box.h) / 2;
      expect(park).toBeGreaterThanOrEqual(0);
      expect(park).toBeLessThanOrEqual(half * 0.45 + 1e-9);
      const parkPx = radiusHandleParkScreenPx();
      const unclamped = parkPx / zoom;
      if (unclamped <= half * 0.45) {
        expect(park * zoom).toBeCloseTo(parkPx, 5);
      }
    }
  );

  it.each([...CANVAS_ZOOMS])(
    'park clears scaled resize/radius hits when radius is interactive at zoom %s',
    (zoom) => {
      if (!radiusHandlesFitOnScreen(box.w, box.h, zoom)) return;
      const parkPx = radiusHandleParkScreenPx();
      const parkScene = radiusParkSceneForBox(box.w, box.h, zoom, parkPx);
      const half = Math.min(box.w, box.h) / 2;
      const expectedScene = Math.min(parkPx / zoom, half * 0.45);
      expect(parkScene).toBeCloseTo(expectedScene, 5);
      const hitScale = chromeHitScaleForBox(box.w, box.h, zoom);
      const resizeHalf = (CHROME_HANDLE_HIT_PX * hitScale) / 2 / zoom;
      const radiusHalf = (CHROME_RADIUS_HIT_PX * hitScale) / 2 / zoom;
      const clearance = parkScene - resizeHalf - radiusHalf;
      if (expectedScene >= parkPx / zoom - 1e-6) {
        expect(clearance * zoom).toBeGreaterThanOrEqual(CHROME_RADIUS_PARK_GAP_PX - 0.05);
      } else {
        expect(clearance).toBeGreaterThanOrEqual(0);
      }
    }
  );

  it.each([...CANVAS_ZOOMS])(
    'hit scale follows on-screen size at zoom %s',
    (zoom) => {
      const scale = chromeHitScaleForBox(box.w, box.h, zoom);
      const minScreen = Math.min(box.w, box.h) * zoom;
      if (minScreen >= 56) expect(scale).toBe(1);
      else {
        expect(scale).toBeLessThan(1);
        expect(scale).toBeGreaterThanOrEqual(0.35);
      }
    }
  );

  it('disables radius hits only when on-screen box is too small (any zoom)', () => {
    expect(radiusHandlesFitOnScreen(200, 150, 0.13)).toBe(false);
    expect(radiusHandlesFitOnScreen(26, 20, 1)).toBe(false);
    expect(radiusHandlesFitOnScreen(200, 150, 1)).toBe(true);
    expect(radiusHandlesFitOnScreen(200, 150, 20)).toBe(true);
    expect(radiusHandlesFitOnScreen(40, 40, 80)).toBe(true);
  });
});
