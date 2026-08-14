import { describe, expect, it } from 'vitest';
import { sceneSurfaceSvgProps, worldCameraViewport } from '../../scene/paint/sceneToSvg';
import type { RcbCamera } from '../../core/types';
import { collectMoveSnapIndicators } from '../alignGuides';

/**
 * Smart guides used to paint on a per-bounds `sceneSurfaceSvgProps` SVG.
 * At fractional DPR that surface origin snaps independently from the shared
 * world viewport → orange guides drift vs the pixel grid / shapes.
 * Guides must portal into `data-rcb-smart-guides-mount` on the world SVG.
 */
describe('smart guides lattice (browser zoom / fractional DPR)', () => {
  const camera: RcbCamera = { x: 12.3, y: 45.6, zoom: 8 };

  it('legacy per-box guide surface drifts from world viewport at dpr 0.9', () => {
    const dpr = 0.9;
    const world = worldCameraViewport(camera, dpr, 800, 600);
    expect(world).not.toBeNull();

    const guideBox = { left: 95.2, top: 40.7, width: 48, height: 28 };
    const surf = sceneSurfaceSvgProps(guideBox, camera, dpr);

    expect(surf.style.left !== guideBox.left || surf.style.top !== guideBox.top).toBe(true);
    expect(surf.style.left).not.toBe(world!.left);
    expect(surf.style.top).not.toBe(world!.top);
  });

  it('worldCameraViewport is stable for the same camera + dpr', () => {
    const dpr = 1.25;
    const a = worldCameraViewport(camera, dpr, 800, 600);
    const b = worldCameraViewport(camera, dpr, 800, 600);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.left).toBe(b!.left);
    expect(a!.top).toBe(b!.top);
    expect(a!.width).toBe(b!.width);
    expect(a!.height).toBe(b!.height);
  });

  it('align guide `at` stays on visual outer edges (integer when ink is on grid)', () => {
    const moving = { left: 10, top: 8, width: 12, height: 10 };
    const target = { left: 26, top: 8, width: 12, height: 10 };
    const guides = collectMoveSnapIndicators(moving, [target], 0.51);

    const aligns = guides.filter((g) => g.kind === 'align');
    expect(aligns.length).toBeGreaterThan(0);
    for (const g of aligns) {
      if (g.kind !== 'align') continue;
      const frac = Math.abs(g.at % 1);
      expect(frac < 1e-9 || Math.abs(frac - 0.5) < 1e-9).toBe(true);
    }

    const topGuide = aligns.find((g) => g.kind === 'align' && g.axis === 'y' && g.at === 8);
    expect(topGuide).toBeTruthy();
  });

  it('center guide may sit on *.5 when visual height is odd — not a lattice bug', () => {
    const moving = { left: 10, top: 8, width: 11, height: 9 };
    const target = { left: 30, top: 8, width: 11, height: 9 };
    const guides = collectMoveSnapIndicators(moving, [target], 0.51);
    const midY = guides.find(
      (g) => g.kind === 'align' && g.axis === 'y' && Math.abs(g.at - (8 + 9 / 2)) < 1e-9
    );
    expect(midY).toBeTruthy();
    expect(midY && midY.kind === 'align' ? midY.at : null).toBe(12.5);
  });
});
