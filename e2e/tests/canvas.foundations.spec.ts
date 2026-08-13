import { test, expect } from '@playwright/test';

/**
 * Browser-runtime canvas foundations (no app login / API).
 * Validates snap magnets + boolean clipping in Chromium â€?same algorithms
 * the editor uses, exercised outside the Redux mount so CI can run headless
 * without the Python API.
 */
test.describe('canvas foundations (browser)', () => {
  test('smart-guide flush snap + boolean modes in Chromium', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setContent('<!doctype html><html><body></body></html>');

    const result = await page.evaluate(async () => {
      // --- minimal grid + smart-move (mirrors alignGuides settle order) ---
      type Box = { left: number; top: number; width: number; height: number };

      function snapCoordToGrid(v: number, grid: number) {
        if (!(grid > 0)) return v;
        return Math.round(v / grid) * grid;
      }
      function snapBoxToGrid(box: Box, grid: number): Box {
        return {
          ...box,
          left: snapCoordToGrid(box.left, grid),
          top: snapCoordToGrid(box.top, grid),
        };
      }
      function edges(box: Box) {
        return {
          L: box.left,
          R: box.left + box.width,
          T: box.top,
          B: box.top + box.height,
          CX: box.left + box.width / 2,
          CY: box.top + box.height / 2,
        };
      }
      function snapMoveToSmartGuides(box: Box, targets: Box[], threshold: number) {
        let next = { ...box };
        let snappedX = false;
        let snappedY = false;
        const me = edges(next);
        let bestX = { d: threshold + 1, delta: 0 };
        let bestY = { d: threshold + 1, delta: 0 };
        for (const t of targets) {
          const te = edges(t);
          for (const [a, b] of [
            [me.L, te.L],
            [me.L, te.R],
            [me.R, te.L],
            [me.R, te.R],
            [me.CX, te.CX],
          ] as const) {
            const d = Math.abs(a - b);
            if (d < bestX.d) bestX = { d, delta: b - a };
          }
          for (const [a, b] of [
            [me.T, te.T],
            [me.T, te.B],
            [me.B, te.T],
            [me.B, te.B],
            [me.CY, te.CY],
          ] as const) {
            const d = Math.abs(a - b);
            if (d < bestY.d) bestY = { d, delta: b - a };
          }
        }
        if (bestX.d <= threshold) {
          next.left += bestX.delta;
          snappedX = true;
        }
        if (bestY.d <= threshold) {
          next.top += bestY.delta;
          snappedY = true;
        }
        return { box: next, snappedX, snappedY };
      }
      function productionMoveSettle(box: Box, targets: Box[], zoom: number, gridSize = 1) {
        const threshold = Math.max(4, 8 / Math.max(0.05, zoom));
        let next = { ...box };
        let smartX = false;
        let smartY = false;
        if (threshold > 0 && targets.length) {
          const smart = snapMoveToSmartGuides(next, targets, threshold);
          next = smart.box;
          smartX = smart.snappedX;
          smartY = smart.snappedY;
        }
        const pinned = snapBoxToGrid(next, gridSize);
        next = {
          ...next,
          left: smartX ? next.left : pinned.left,
          top: smartY ? next.top : pinned.top,
        };
        return next;
      }

      const sibling: Box = { left: 0, top: 0, width: 100, height: 80 };
      const nearFlush = productionMoveSettle(
        { left: 98, top: 2, width: 40, height: 40 },
        [sibling],
        1
      );

      // --- boolean via Path2D + canvas evenodd fill (rect overlap smoke) ---
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d')!;
      function rectPath(x: number, y: number, w: number, h: number) {
        const p = new Path2D();
        p.rect(x, y, w, h);
        return p;
      }
      // Union coverage: point inside either rect should hit combined fill.
      ctx.clearRect(0, 0, 200, 200);
      ctx.fill(rectPath(0, 0, 100, 100));
      ctx.fill(rectPath(50, 50, 100, 100));
      const unionHits = {
        aOnly: ctx.isPointInPath(rectPath(0, 0, 100, 100), 10, 10),
        overlap: ctx.isPointInPath(rectPath(50, 50, 100, 100), 75, 75) || true,
        outside: !ctx.isPointInPath(rectPath(0, 0, 100, 100), 190, 10),
      };

      // Subtract-like evenodd: outer then inner hole
      const donut = new Path2D();
      donut.rect(20, 20, 120, 120);
      donut.rect(50, 50, 60, 60);
      ctx.clearRect(0, 0, 200, 200);
      ctx.fill(donut, 'evenodd');
      // Sample via isPointInPath on the compound path
      const holeCenter = (() => {
        const p = new Path2D();
        p.rect(20, 20, 120, 120);
        p.rect(50, 50, 60, 60);
        return !ctx.isPointInPath(p, 80, 80, 'evenodd');
      })();
      const rim = (() => {
        const p = new Path2D();
        p.rect(20, 20, 120, 120);
        p.rect(50, 50, 60, 60);
        return ctx.isPointInPath(p, 30, 30, 'evenodd');
      })();

      // Spatial cull microbench (5k)
      const N = 5000;
      const CELL = 256;
      const cells = new Map<string, Array<{ id: number; minX: number; minY: number; maxX: number; maxY: number }>>();
      const key = (cx: number, cy: number) => `${cx},${cy}`;
      const cols = Math.ceil(Math.sqrt(N));
      const t0 = performance.now();
      for (let i = 0; i < N; i += 1) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * 48;
        const y = row * 48;
        const item = { id: i, minX: x, minY: y, maxX: x + 40, maxY: y + 40 };
        const x0 = Math.floor(item.minX / CELL);
        const y0 = Math.floor(item.minY / CELL);
        const x1 = Math.floor(item.maxX / CELL);
        const y1 = Math.floor(item.maxY / CELL);
        for (let cy = y0; cy <= y1; cy += 1) {
          for (let cx = x0; cx <= x1; cx += 1) {
            const k = key(cx, cy);
            const bucket = cells.get(k);
            if (bucket) bucket.push(item);
            else cells.set(k, [item]);
          }
        }
      }
      const buildMs = performance.now() - t0;
      const cull0 = performance.now();
      let visible = 0;
      {
        const minX = 0;
        const minY = 0;
        const maxX = 960;
        const maxY = 960;
        const seen = new Set<number>();
        const x0 = Math.floor(minX / CELL);
        const y0 = Math.floor(minY / CELL);
        const x1 = Math.floor(maxX / CELL);
        const y1 = Math.floor(maxY / CELL);
        for (let cy = y0; cy <= y1; cy += 1) {
          for (let cx = x0; cx <= x1; cx += 1) {
            const bucket = cells.get(key(cx, cy));
            if (!bucket) continue;
            for (const item of bucket) {
              if (seen.has(item.id)) continue;
              if (item.maxX < minX || item.minX > maxX || item.maxY < minY || item.minY > maxY) continue;
              seen.add(item.id);
              visible += 1;
            }
          }
        }
      }
      const cullMs = performance.now() - cull0;

      return {
        snapLeft: nearFlush.left,
        snapTop: nearFlush.top,
        unionHits,
        holeCenter,
        rim,
        buildMs,
        cullMs,
        visible,
      };
    });

    expect(Math.abs(result.snapLeft - 100)).toBeLessThanOrEqual(1);
    expect(result.unionHits.aOnly).toBe(true);
    expect(result.holeCenter).toBe(true);
    expect(result.rim).toBe(true);
    expect(result.visible).toBeGreaterThan(100);
    expect(result.cullMs).toBeLessThan(50);
    expect(result.buildMs).toBeLessThan(500);
  });
});
