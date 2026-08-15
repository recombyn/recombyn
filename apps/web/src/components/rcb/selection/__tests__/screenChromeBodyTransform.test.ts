import { describe, expect, it } from 'vitest';
import {
  screenChromeBodyTransform,
  screenSceneRootTransform,
  worldChromeBodyTransform,
} from '../SelectionChrome';

describe('screenChromeBodyTransform', () => {
  it('maps scene origin through camera to screen + scale(z)', () => {
    const camera = { x: 10, y: 20, zoom: 8 };
    const box = { left: 100, top: 50, width: 40, height: 20 };
    // screen = scene * z + pan → (810, 420)
    expect(screenChromeBodyTransform(null, box, 0, camera, 1)).toBe(
      'translate(810 420) scale(8)'
    );
  });

  it('rotates about scaled box center in screen space', () => {
    const camera = { x: 0, y: 0, zoom: 2 };
    const box = { left: 10, top: 20, width: 40, height: 30 };
    expect(screenChromeBodyTransform(null, box, 15, camera, 1)).toBe(
      'translate(20 40) rotate(15 40 30) scale(2)'
    );
  });

  it('prefers live host translate over box origin', () => {
    const el = {
      getAttribute: (name: string) =>
        name === 'transform' ? 'translate(12.5 34.5)' : null,
    } as unknown as SVGElement;
    const tf = screenChromeBodyTransform(
      el,
      { left: 0, top: 0, width: 10, height: 10 },
      0,
      { x: 0, y: 0, zoom: 1 },
      1
    );
    expect(tf).toBe('translate(12.5 34.5) scale(1)');
  });
});

describe('worldChromeBodyTransform', () => {
  it('aliases screenChromeBodyTransform with the same camera', () => {
    const camera = { x: 10, y: 20, zoom: 8 };
    const box = { left: 100, top: 50, width: 40, height: 20 };
    expect(worldChromeBodyTransform(null, box, 0, camera, 1)).toBe(
      screenChromeBodyTransform(null, box, 0, camera, 1)
    );
  });
});

describe('screenSceneRootTransform', () => {
  it('applies camera pan + scale for absolute scene→screen roots', () => {
    expect(screenSceneRootTransform({ x: 100.4, y: -40.7, zoom: 0.18 }, 1)).toBe(
      'translate(100 -41) scale(0.18)'
    );
  });
});
